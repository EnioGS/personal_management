import Papa from 'papaparse'
import { parseDateValue } from '@/lib/parse-date'
import { parseNumberValue } from '@/lib/parse-number'
import { placementsOf, type LabelCatalogue } from './label-catalogue'
import { DEFAULT_MEANING } from './ingestion'
import { confirmedRowsTable, ingestionAuditEventsTable, sourceFilesTable, sourceRowsTable } from './model-db'
import { newRowId } from './row-id'
import { applySignConvention, shapeOfAmounts } from './sign-convention'
import type { ConfirmedRow, IngestionTargetField, SourceFile, SourceRow } from './types'

/** The column every source row carries, and which no assignment may claim. */
export const SOURCE_FILENAME_COLUMN = 'source_filename'

/** Canonical fields a source column can be assigned to. Placement is a label, not a column. */
export const ASSIGNABLE_FIELDS: IngestionTargetField[] = ['date', 'amount', 'asset', 'quantity', 'price', 'investmentType', 'investmentClass']

export function parseSourceCsv(rawCsv: string): { columns: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(rawCsv, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0) throw new Error(`Could not parse CSV: ${parsed.errors[0].message}`)
  const columns = parsed.meta.fields ?? []
  if (columns.length === 0) throw new Error('The CSV has no header row.')
  if (new Set(columns).size !== columns.length) throw new Error('The CSV has duplicate column names. Rename them before importing.')
  return { columns, rows: parsed.data.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? '']))) }
}

/**
 * How alike two filenames are, as a share of the shorter one.
 *
 * "Nubank_2026-09-08 (1).csv" and "Nubank_2026-09-08.csv" are the same export downloaded
 * twice, and nothing inside them says so — the names are the only evidence, so they are
 * what is compared.
 */
export function filenameSimilarity(left: string, right: string): number {
  const a = left.toLowerCase()
  const b = right.toLowerCase()
  const shorter = Math.min(a.length, b.length)
  if (shorter === 0) return 0
  let common = 0
  while (common < shorter && a[common] === b[common]) common += 1
  return common / shorter
}

export async function createSourceFile(originalFilename: string, rawCsv: string): Promise<number> {
  const parsed = parseSourceCsv(rawCsv)
  const existing = await sourceFilesTable.toArray()
  const looksLike = existing
    .map((row) => ({ id: row.id, file: row.data as SourceFile }))
    .map((candidate) => ({ ...candidate, similarity: filenameSimilarity(candidate.file.originalFilename, originalFilename) }))
    .sort((left, right) => right.similarity - left.similarity)[0]

  const sourceId = await sourceFilesTable.add({
    createdAt: Date.now(),
    data: {
      originalFilename,
      importedAt: Date.now(),
      rawCsv,
      originalColumns: parsed.columns,
      assignments: {},
      signConvention: { kind: 'asImported' },
      // Recorded, never acted on by itself: a near-identical name is a reason to look,
      // not a reason to drop anything.
      looksLikeSourceId: looksLike && looksLike.similarity >= 0.8 ? looksLike.id : undefined,
    } satisfies SourceFile,
  })

  await sourceRowsTable.bulkAdd(parsed.rows.map((values) => ({
    createdAt: Date.now(),
    data: {
      sourceId,
      rowId: newRowId(values),
      values: { [SOURCE_FILENAME_COLUMN]: originalFilename, ...values },
      // Placement starts empty because nobody has decided it; meaning starts at its
      // default because "unspecified" is itself an answer for a category.
      labels: { category: DEFAULT_MEANING, subcategory: DEFAULT_MEANING },
    } satisfies SourceRow,
  })))

  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'sourceUploaded', actor: 'user', sourceId, details: { originalFilename, rows: parsed.rows.length } },
  })
  return sourceId
}

/** Only original columns may be assigned; the filename column and the labels may not. */
export async function assignSourceColumns(sourceId: number, assignments: Record<string, IngestionTargetField | null>): Promise<SourceFile> {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const file = stored.data as SourceFile
  const next: Record<string, IngestionTargetField> = { ...file.assignments }

  for (const [column, target] of Object.entries(assignments)) {
    if (!file.originalColumns.includes(column)) {
      throw new Error(`"${column}" is not a column of this file. Only the file's own columns can be assigned.`)
    }
    if (target === null) { delete next[column]; continue }
    if (!ASSIGNABLE_FIELDS.includes(target)) throw new Error(`"${target}" is not a canonical field.`)
    // One meaning, one column: reassigning a field moves it rather than duplicating it.
    for (const [other, assigned] of Object.entries(next)) if (assigned === target && other !== column) delete next[other]
    next[column] = target
  }

  const updated: SourceFile = { ...file, assignments: next }
  await sourceFilesTable.update(sourceId, { data: updated })
  return updated
}

export async function setSignConvention(sourceId: number, convention: SourceFile['signConvention']): Promise<SourceFile> {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const updated: SourceFile = { ...(stored.data as SourceFile), signConvention: convention }
  await sourceFilesTable.update(sourceId, { data: updated })
  return updated
}

/** What the file's amount column looks like — the evidence a sign decision is made from. */
export async function amountShapeOf(sourceId: number) {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const file = stored.data as SourceFile
  const amountColumn = Object.entries(file.assignments).find(([, target]) => target === 'amount')?.[0]
  if (!amountColumn) return { amountColumn: null, shape: null }
  const rows = (await sourceRowsTable.toArray()).map((row) => row.data as SourceRow).filter((row) => row.sourceId === sourceId)
  return { amountColumn, shape: shapeOfAmounts(rows.map((row) => row.values[amountColumn])) }
}

function canonicalValue(row: SourceRow, file: SourceFile, field: IngestionTargetField): string | undefined {
  const column = Object.entries(file.assignments).find(([, target]) => target === field)?.[0]
  return column ? row.values[column] : undefined
}

/**
 * Everything the file said that no column was assigned to, plus where it came from and —
 * when the sign was changed — the value the file actually wrote. Kept as one column so a
 * confirmed table stays readable whatever shape the file it came from had.
 */
export function observationsFor(row: SourceRow, file: SourceFile, importedAmount?: string): string {
  const assigned = new Set(Object.keys(file.assignments))
  const parts: Record<string, string> = {}
  for (const [column, value] of Object.entries(row.values)) {
    if (assigned.has(column) || value === '') continue
    parts[column] = value
  }
  if (importedAmount !== undefined) parts.amount_as_imported = importedAmount
  return JSON.stringify(parts)
}

export interface ConfirmationPlan {
  ready: number[]
  incomplete: number[]
  marked: number[]
}

export async function planConfirmation(sourceId: number, catalogue: LabelCatalogue): Promise<ConfirmationPlan> {
  const rows = (await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === sourceId)
  const plan: ConfirmationPlan = { ready: [], incomplete: [], marked: [] }
  for (const stored of rows) {
    const row = stored.data as SourceRow
    if (row.markedForElimination) { plan.marked.push(stored.id); continue }
    if (placementsOf(row.labels, catalogue).length > 0) plan.ready.push(stored.id)
    else plan.incomplete.push(stored.id)
  }
  return plan
}

export interface ConfirmationResult {
  confirmed: number
  copies: number
  leftBehind: number
  discarded: number
  removedFile: boolean
}

/**
 * Moves rows into the tables their labels name.
 *
 * A row goes to one table per (section, screen) pair it names, every copy carrying the
 * same row id, and leaves the source file — so a file empties as it is dealt with rather
 * than holding a second copy of everything already confirmed.
 *
 * `discardMarked` is the destructive half: it also drops what was marked for elimination
 * and retires the file. Without it, marked and unlabelled rows stay where they are.
 */
export async function confirmSourceRows(sourceId: number, catalogue: LabelCatalogue, options: { discardMarked?: boolean } = {}): Promise<ConfirmationResult> {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const file = stored.data as SourceFile
  const rows = (await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === sourceId)

  const result: ConfirmationResult = { confirmed: 0, copies: 0, leftBehind: 0, discarded: 0, removedFile: false }
  const confirmedAt = Date.now()
  const consumed: number[] = []

  for (const record of rows) {
    const row = record.data as SourceRow
    if (row.markedForElimination) {
      if (options.discardMarked) { consumed.push(record.id); result.discarded += 1 }
      else result.leftBehind += 1
      continue
    }
    const placements = placementsOf(row.labels, catalogue)
    if (placements.length === 0) { result.leftBehind += 1; continue }

    const importedAmount = canonicalValue(row, file, 'amount')
    const amount = applySignConvention(parseNumberValue(importedAmount), file.signConvention, row.values)
    const changed = file.signConvention.kind !== 'asImported'
    const base = {
      rowId: row.rowId,
      sourceFilename: row.values[SOURCE_FILENAME_COLUMN] ?? file.originalFilename,
      confirmedAt,
      date: parseDateValue(canonicalValue(row, file, 'date')) ?? undefined,
      amount: amount ?? undefined,
      observations: observationsFor(row, file, changed ? importedAmount : undefined),
      category: row.labels.category?.trim() || DEFAULT_MEANING,
      subcategory: row.labels.subcategory?.trim() || DEFAULT_MEANING,
      asset: canonicalValue(row, file, 'asset') || undefined,
      quantity: parseNumberValue(canonicalValue(row, file, 'quantity')) ?? undefined,
      price: parseNumberValue(canonicalValue(row, file, 'price')) ?? undefined,
      investmentType: canonicalValue(row, file, 'investmentType') || undefined,
      investmentClass: canonicalValue(row, file, 'investmentClass') || undefined,
    }

    await confirmedRowsTable.bulkAdd(placements.map((placement) => ({
      createdAt: confirmedAt,
      data: { ...base, section: placement.section, screen: placement.screen } satisfies ConfirmedRow,
    })))
    consumed.push(record.id)
    result.confirmed += 1
    result.copies += placements.length
  }

  await sourceRowsTable.bulkDelete(consumed)
  if (options.discardMarked && result.leftBehind === 0) {
    await sourceFilesTable.delete(sourceId)
    result.removedFile = true
  }
  await ingestionAuditEventsTable.add({
    createdAt: confirmedAt,
    data: { event: 'rowsPromoted', actor: 'user', sourceId, details: { ...result } },
  })
  return result
}
