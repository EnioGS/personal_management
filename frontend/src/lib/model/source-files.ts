import Papa from 'papaparse'
import { parseDateValue } from '@/lib/parse-date'
import { parseNumberValue } from '@/lib/parse-number'
import { placementsOf, type LabelCatalogue } from './label-catalogue'
import { DEFAULT_MEANING, ingestionLabelErrors } from './ingestion'
import { confirmedRowsTable, ingestionAuditEventsTable, sourceFilesTable, sourceRowsTable } from './model-db'
import { newRowId } from './row-id'
import { applySignConvention, shapeOfAmounts } from './sign-convention'
import type { ConfirmedRow, IngestionTargetField, SourceFile, SourceRow } from './types'

/** The column every source row carries, and which no assignment may claim. */
export const SOURCE_FILENAME_COLUMN = 'source_filename'

/** Canonical fields a source column can be assigned to. Placement is a label, not a column. */
export const ASSIGNABLE_FIELDS: IngestionTargetField[] = ['date', 'amount', 'asset', 'quantity', 'price', 'investmentType', 'investmentClass']

/**
 * Turns a markdown table into CSV, and leaves anything else alone.
 *
 * A statement pasted into the chat, or saved as .md, often arrives as a pipe table. It is
 * a table — it has a header and rows — so refusing it would be pedantry; the separator
 * line under the header is the only part with nothing to say.
 */
export function fromMarkdownTable(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const rows = lines.filter((line) => line.startsWith('|') && line.endsWith('|'))
  if (rows.length < 2) return text

  const cells = rows
    .filter((line) => !/^\|[\s|:-]+\|$/.test(line))
    .map((line) => line.slice(1, -1).split('|').map((cell) => cell.trim()))
  return cells.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
}

/**
 * Reads a file's text into columns and rows.
 *
 * The delimiter is detected rather than demanded: exports come out comma-separated,
 * semicolon-separated (anywhere the comma is a decimal point) and tab-separated, and
 * which one a file used is not something anyone should have to say.
 */
export function parseSourceCsv(rawCsv: string): { columns: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(fromMarkdownTable(rawCsv), { header: true, skipEmptyLines: true })
  // "Could not auto-detect a delimiter" is a note, not a failure: a single-column file
  // has no delimiter to find, and the parse is still right.
  const fatal = parsed.errors.filter((error) => error.type !== 'Delimiter')
  if (fatal.length > 0) throw new Error(`Could not read this file: ${fatal[0].message}`)
  const columns = (parsed.meta.fields ?? []).map((column) => column.trim()).filter(Boolean)
  if (columns.length === 0) throw new Error('The file has no header row.')
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

/**
 * What two rows are compared on when asking whether they are the same transaction.
 *
 * The date and the amount when the file says which columns those are — that is what
 * survives a bank re-exporting the same statement with a column renamed. Otherwise
 * everything the row carries except where it came from, which is the only honest
 * fallback for a file nobody has assigned yet.
 */
export function rowSignature(values: Record<string, string>, assignments: Record<string, IngestionTargetField>): string {
  const of = (field: IngestionTargetField) => {
    const column = Object.entries(assignments).find(([, target]) => target === field)?.[0]
    return column ? values[column] : undefined
  }
  const date = parseDateValue(of('date'))
  const amount = parseNumberValue(of('amount'))
  if (date !== null && amount !== null) return `${date}|${Math.abs(amount).toFixed(2)}`
  return Object.entries(values)
    .filter(([column]) => column !== SOURCE_FILENAME_COLUMN)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([column, value]) => `${column}=${value.trim().toLowerCase()}`)
    .join('|')
}

/**
 * Flags rows that look like rows of a different file, and unflags those that no longer do.
 *
 * Narrow on purpose. A row is only ever compared against rows that came from another
 * filename — inside one file, two identical rows are two real transactions. The flag is
 * advisory: it says "look at this", never "drop this", and only the person or the
 * assistant reading it decides anything.
 */
export async function flagCrossFileDuplicates(sourceId: number): Promise<{ flagged: number }> {
  const files = new Map((await sourceFilesTable.toArray()).map((row) => [row.id, row.data as SourceFile]))
  const file = files.get(sourceId)
  if (!file) throw new Error(`Source file ${sourceId} was not found.`)

  const elsewhere = new Map<string, string>()
  for (const stored of await sourceRowsTable.toArray()) {
    const row = stored.data as SourceRow
    if (row.sourceId === sourceId) continue
    const other = files.get(row.sourceId)
    if (other) elsewhere.set(rowSignature(row.values, other.assignments), row.rowId)
  }
  for (const stored of await confirmedRowsTable.toArray()) {
    const row = stored.data as ConfirmedRow
    if (row.sourceFilename === file.originalFilename) continue
    if (typeof row.date === 'number' && typeof row.amount === 'number') {
      elsewhere.set(`${row.date}|${Math.abs(row.amount).toFixed(2)}`, row.rowId)
    }
  }

  let flagged = 0
  for (const stored of await sourceRowsTable.toArray()) {
    const row = stored.data as SourceRow
    if (row.sourceId !== sourceId) continue
    const match = elsewhere.get(rowSignature(row.values, file.assignments))
    if (match === row.duplicateOf) { if (match) flagged += 1; continue }
    await sourceRowsTable.update(stored.id, { data: { ...row, duplicateOf: match } satisfies SourceRow })
    if (match) flagged += 1
  }
  return { flagged }
}

export async function createSourceFile(originalFilename: string, rawCsv: string): Promise<number> {
  const parsed = parseSourceCsv(rawCsv)
  // A table with a header and nothing under it is not data. Refusing it here is clearer
  // than creating a file that would be retired a moment later for being empty.
  if (parsed.rows.length === 0) throw new Error('This file has a header row and no rows under it.')
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

  const duplicates = await flagCrossFileDuplicates(sourceId)
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'sourceUploaded', actor: 'user', sourceId, details: { originalFilename, rows: parsed.rows.length, ...duplicates } },
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
  // Which column holds the amount may have just changed, and with it what the sign
  // convention applies to; what a row is compared on has changed too.
  await rewriteAmounts(sourceId, updated)
  await flagCrossFileDuplicates(sourceId)
  return updated
}

export async function setSignConvention(sourceId: number, convention: SourceFile['signConvention']): Promise<SourceFile> {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const updated: SourceFile = { ...(stored.data as SourceFile), signConvention: convention }
  await sourceFilesTable.update(sourceId, { data: updated })
  await rewriteAmounts(sourceId, updated)
  return updated
}

/** Which of the file's columns carries a given canonical field, if any. */
function columnFor(file: SourceFile, field: IngestionTargetField): string | undefined {
  return Object.entries(file.assignments).find(([, target]) => target === field)?.[0]
}

/**
 * Rewrites the amount column so the table says what the app means.
 *
 * The transformation is applied to the data, not kept as a note beside it: a source table
 * read by eye, by SQL or by the assistant shows one amount, and it is the one that will
 * be confirmed. What the file actually wrote is kept on the row so the transformation can
 * always be undone, re-applied after an assignment changes, and recorded in the
 * observations of every confirmed row.
 */
export async function rewriteAmounts(sourceId: number, file: SourceFile): Promise<void> {
  const amountColumn = columnFor(file, 'amount')
  for (const stored of await sourceRowsTable.toArray()) {
    const row = stored.data as SourceRow
    if (row.sourceId !== sourceId) continue

    // Without an amount column there is nothing to transform, so anything previously
    // rewritten goes back to what the file said.
    if (!amountColumn) {
      if (row.importedAmount === undefined) continue
      const restored = { ...row, values: { ...row.values }, importedAmount: undefined }
      await sourceRowsTable.update(stored.id, { data: restored satisfies SourceRow })
      continue
    }

    const imported = row.importedAmount ?? row.values[amountColumn] ?? ''
    const next: SourceRow = { ...row, values: { ...row.values } }
    if (file.signConvention.kind === 'asImported') {
      next.values[amountColumn] = imported
      next.importedAmount = undefined
    } else {
      const transformed = applySignConvention(parseNumberValue(imported), file.signConvention, { ...row.values, [amountColumn]: imported })
      next.values[amountColumn] = transformed === null ? imported : String(transformed)
      next.importedAmount = imported
    }
    if (next.values[amountColumn] === row.values[amountColumn] && next.importedAmount === row.importedAmount) continue
    await sourceRowsTable.update(stored.id, { data: next })
  }
}

/** What the file's amount column looks like — the evidence a sign decision is made from. */
export async function amountShapeOf(sourceId: number) {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const file = stored.data as SourceFile
  const amountColumn = columnFor(file, 'amount')
  if (!amountColumn) return { amountColumn: null, shape: null }
  const rows = (await sourceRowsTable.toArray()).map((row) => row.data as SourceRow).filter((row) => row.sourceId === sourceId)
  return { amountColumn, shape: shapeOfAmounts(rows.map((row) => row.values[amountColumn])) }
}

function canonicalValue(row: SourceRow, file: SourceFile, field: IngestionTargetField): string | undefined {
  const column = columnFor(file, field)
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

/** A row is ready when nothing is missing from it and its labels name somewhere to go. */
function isReady(row: SourceRow, catalogue: LabelCatalogue): boolean {
  return ingestionLabelErrors(row.labels, catalogue).length === 0 && placementsOf(row.labels, catalogue).length > 0
}

export interface ConfirmationPlan {
  ready: number[]
  incomplete: number[]
  marked: number[]
}

/**
 * Adds a blank row to a file's table.
 *
 * A statement can be missing a line — a transaction the bank never exported, or one the
 * user knows about before it clears. The row is empty and unlabelled, so it is subject to
 * exactly the same requirements as every other row before it can be confirmed, and it
 * gets a row id of its own like any other.
 */
export async function addSourceRow(sourceId: number): Promise<number> {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const file = stored.data as SourceFile
  const values: Record<string, string> = { [SOURCE_FILENAME_COLUMN]: file.originalFilename }
  for (const column of file.originalColumns) values[column] = ''

  return sourceRowsTable.add({
    createdAt: Date.now(),
    data: {
      sourceId,
      rowId: newRowId({ ...values, addedAt: Date.now() }),
      values,
      labels: { category: DEFAULT_MEANING, subcategory: DEFAULT_MEANING },
    } satisfies SourceRow,
  })
}

/**
 * Edits one of a row's own values.
 *
 * Editing the amount edits what the *file* said, not what the convention made of it: the
 * transformation is re-applied to the new value, so a corrected amount ends up signed the
 * same way as every other row in the file rather than escaping the rule.
 */
export async function updateSourceValue(rowId: number, column: string, value: string): Promise<void> {
  const stored = await sourceRowsTable.get(rowId)
  if (!stored) throw new Error(`Source row ${rowId} was not found.`)
  const row = stored.data as SourceRow
  if (column === SOURCE_FILENAME_COLUMN) throw new Error('Where a row came from is not editable.')

  const file = (await sourceFilesTable.get(row.sourceId))?.data as SourceFile | undefined
  const isAmount = file ? columnFor(file, 'amount') === column : false
  await sourceRowsTable.update(rowId, {
    data: { ...row, values: { ...row.values, [column]: value }, importedAmount: isAmount ? undefined : row.importedAmount } satisfies SourceRow,
  })
  if (file && isAmount) await rewriteAmounts(row.sourceId, file)
  if (file) await flagCrossFileDuplicates(row.sourceId)
}

/**
 * Retires every source file with nothing left in it.
 *
 * Files are retired as they empty, but one emptied by a build that did not do that is
 * still sitting there, and so is one whose last row left by some other route. This runs
 * when the ingestion centre opens, so an empty table is never something the user has to
 * clear up by hand.
 */
export async function retireEmptySourceFiles(): Promise<number> {
  const files = await sourceFilesTable.toArray()
  const rows = await sourceRowsTable.toArray()
  const holding = new Set(rows.map((row) => (row.data as SourceRow).sourceId))
  const empty = files.filter((file) => !holding.has(file.id))
  await sourceFilesTable.bulkDelete(empty.map((file) => file.id))
  return empty.length
}

/** Removes a source file that holds no rows — one emptied by confirmation, or empty from the start. */
export async function retireIfEmpty(sourceId: number): Promise<boolean> {
  const remaining = (await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === sourceId)
  if (remaining.length > 0) return false
  await sourceFilesTable.delete(sourceId)
  return true
}

export async function planConfirmation(sourceId: number, catalogue: LabelCatalogue): Promise<ConfirmationPlan> {
  const rows = (await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === sourceId)
  const plan: ConfirmationPlan = { ready: [], incomplete: [], marked: [] }
  for (const stored of rows) {
    const row = stored.data as SourceRow
    if (row.markedForElimination) { plan.marked.push(stored.id); continue }
    if (isReady(row, catalogue)) plan.ready.push(stored.id)
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
    if (!isReady(row, catalogue)) { result.leftBehind += 1; continue }
    const placements = placementsOf(row.labels, catalogue)

    const amount = parseNumberValue(canonicalValue(row, file, 'amount'))
    const base = {
      rowId: row.rowId,
      sourceFilename: row.values[SOURCE_FILENAME_COLUMN] ?? file.originalFilename,
      confirmedAt,
      date: parseDateValue(canonicalValue(row, file, 'date')) ?? undefined,
      amount: amount ?? undefined,
      observations: observationsFor(row, file, row.importedAmount),
      category: row.labels.category?.trim() || DEFAULT_MEANING,
      subcategory: row.labels.subcategory?.trim() || DEFAULT_MEANING,
      asset: canonicalValue(row, file, 'asset') || undefined,
      quantity: parseNumberValue(canonicalValue(row, file, 'quantity')) ?? undefined,
      price: parseNumberValue(canonicalValue(row, file, 'price')) ?? undefined,
      investmentType: canonicalValue(row, file, 'investmentType') || undefined,
      investmentClass: canonicalValue(row, file, 'investmentClass') || undefined,
      account: row.labels.account?.trim() || undefined,
      card: row.labels.card?.trim() || undefined,
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
  // A file whose rows have all been dealt with has nothing left to show, so it goes —
  // whether the last of them was confirmed or discarded. Its rows keep the filename.
  if (await retireIfEmpty(sourceId)) result.removedFile = true
  await ingestionAuditEventsTable.add({
    createdAt: confirmedAt,
    data: { event: 'rowsPromoted', actor: 'user', sourceId, details: { ...result } },
  })
  return result
}
