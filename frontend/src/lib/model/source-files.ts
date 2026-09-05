import Papa from 'papaparse'
import { parseDateValue } from '@/lib/parse-date'
import { parseNumberValue } from '@/lib/parse-number'
import { placementsOf, type LabelCatalogue } from './label-catalogue'
import { ingestionLabelErrors } from './ingestion'
import { SOURCE_FILENAME_KEY, readObservations, sourceFilenameOf } from './observations'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import { confirmedRowsTable, ingestionAuditEventsTable, sourceFilesTable, sourceRowsTable } from './model-db'
import { newRowId } from './row-id'
import { applySignConvention, shapeOfAmounts } from './sign-convention'
import type { ConfirmedRow, IngestionTargetField, SourceFile, SourceRow } from './types'

/** The column every source row carries, and which no assignment may claim. */
export const SOURCE_FILENAME_COLUMN = 'source_filename'

/** Canonical fields a source column can be assigned to. Placement is a label, not a column. */
export const ASSIGNABLE_FIELDS: IngestionTargetField[] = ['date', 'value', 'amount', 'price']

/** The screen whose rows are holdings rather than money: what it needs assigned differs. */
const INVESTMENTS_SCREEN = 'investments'

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
 * What a file might have used to separate its columns, in the order they are tried.
 *
 * The first four are what exports come out as. The spaced ones are what a person writes:
 * a statement typed or pasted as "Date - Type - Asset - Value" is a table, and refusing
 * to see it because nobody wrote commas would be pedantry. They are spaced on purpose —
 * a bare hyphen would split dates and negative numbers.
 */
const DELIMITERS_TO_GUESS = [',', ';', '\t', '|', ' - ', ' | ', ' — ']

/**
 * Reads a file's text into columns and rows.
 *
 * The delimiter is detected rather than demanded: which one a file used is not something
 * anyone should have to say. `delimiter` says it anyway, for the file whose own values
 * contain whatever it separates with — detection picks whatever splits the file most
 * consistently, and a description holding a dash can outvote the truth.
 */
export function parseSourceCsv(rawCsv: string, delimiter?: string): { columns: string[]; rows: Record<string, string>[] } {
  const parsed = Papa.parse<Record<string, string>>(fromMarkdownTable(rawCsv), {
    header: true,
    skipEmptyLines: true,
    ...(delimiter ? { delimiter } : { delimitersToGuess: DELIMITERS_TO_GUESS }),
  })
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
  const columnOf = (field: IngestionTargetField) => Object.entries(assignments).find(([, target]) => target === field)?.[0]
  const dateColumn = columnOf('date')
  const valueColumn = columnOf('value')

  // The date and the value are read rather than compared as text, so 01/08/2026 and
  // 2026-08-01 are the same day and "1.234,56" is the same money as "1234.56".
  const date = parseDateValue(dateColumn ? values[dateColumn] : undefined)
  const value = parseNumberValue(valueColumn ? values[valueColumn] : undefined)
  const rest = Object.entries(values)
    .filter(([column]) => column !== SOURCE_FILENAME_COLUMN && column !== dateColumn && column !== valueColumn)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([column, cell]) => `${column}=${normalise(cell)}`)
    .join('|')

  return `${date ?? ''}|${value === null ? '' : Math.abs(value).toFixed(2)}|${rest}`
}

/** The same signature for a row already confirmed: its date, its money, and what its file said. */
export function confirmedRowSignature(row: ConfirmedRow): string {
  const rest = Object.entries(readObservations(row.observations))
    .filter(([key]) => key !== SOURCE_FILENAME_KEY && key !== 'value_as_imported')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, cell]) => `${key}=${normalise(cell)}`)
    .join('|')

  return `${row.date ?? ''}|${row.value === undefined ? '' : Math.abs(row.value).toFixed(2)}|${rest}`
}

/** Spacing and case are how the same text is written twice, not how two things differ. */
function normalise(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Flags rows that look like rows of a different file, and unflags those that no longer do.
 *
 * Narrow on purpose. A row is only ever compared against rows that came from another
 * filename — inside one file, two identical rows are two real transactions. The flag is
 * advisory: it says "look at this", never "drop this", and only the person or the
 * assistant reading it decides anything.
 *
 * Several files are scanned in one pass. Per file it meant reading every row the app
 * holds once for each of them — an upload of forty files read the whole vault forty
 * times, over a set growing as it went — and writing each changed row on its own. One
 * read, one write.
 */
export async function flagCrossFileDuplicates(...sourceIds: number[]): Promise<{ flagged: number }> {
  if (sourceIds.length === 0) return { flagged: 0 }
  const targets = new Set(sourceIds)
  const files = new Map((await sourceFilesTable.toArray()).map((row) => [row.id, row.data as SourceFile]))
  for (const sourceId of sourceIds) {
    if (!files.has(sourceId)) throw new Error(`Source file ${sourceId} was not found.`)
  }

  const [sourceRows, confirmedRows] = await Promise.all([sourceRowsTable.toArray(), confirmedRowsTable.toArray()])

  // Every signature in the vault, with the filename it came from: a row is compared
  // against this minus its own file, so one index serves every file being scanned.
  const seen = new Map<string, { filename: string; rowId: string }[]>()
  const remember = (signature: string, filename: string, rowId: string) => {
    seen.set(signature, [...(seen.get(signature) ?? []), { filename, rowId }])
  }
  for (const stored of sourceRows) {
    const row = stored.data as SourceRow
    const file = files.get(row.sourceId)
    if (file) remember(rowSignature(row.values, file.assignments), file.originalFilename, row.rowId)
  }
  for (const stored of confirmedRows) {
    const row = stored.data as ConfirmedRow
    // Which file a confirmed row came from is in its observations, where the file's own
    // name was condensed along with everything else no column was assigned to.
    remember(confirmedRowSignature(row), sourceFilenameOf(row.observations), row.rowId)
  }

  let flagged = 0
  const updates: LocalRow[] = []
  for (const stored of sourceRows) {
    const row = stored.data as SourceRow
    if (!targets.has(row.sourceId)) continue
    const file = files.get(row.sourceId)!
    const match = seen
      .get(rowSignature(row.values, file.assignments))
      ?.find((candidate) => candidate.filename !== file.originalFilename)?.rowId

    if (match) flagged += 1
    if (match === row.duplicateOf) continue
    updates.push({ ...stored, data: { ...row, duplicateOf: match } satisfies SourceRow })
  }
  if (updates.length > 0) await sourceRowsTable.bulkPut(updates)
  return { flagged }
}

export async function createSourceFile(
  originalFilename: string,
  rawCsv: string,
  options: { scanDuplicates?: boolean; delimiter?: string } = {},
): Promise<number> {
  const parsed = parseSourceCsv(rawCsv, options.delimiter)
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
      // The text itself is not kept: every row of it is stored as a row, and holding the
      // whole file as well meant re-reading it from the database on every refresh.
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
      // Nothing starts labelled: a row arrives saying what the file said and no more.
      labels: {},
    } satisfies SourceRow,
  })))

  // A caller importing several files scans once at the end instead of once per file.
  const duplicates = options.scanDuplicates === false ? { flagged: 0 } : await flagCrossFileDuplicates(sourceId)
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
 * Rewrites the value column so the table says what the app means.
 *
 * The transformation is applied to the data, not kept as a note beside it: a source table
 * read by eye, by SQL or by the assistant shows one amount, and it is the one that will
 * be confirmed. What the file actually wrote is kept on the row so the transformation can
 * always be undone, re-applied after an assignment changes, and recorded in the
 * observations of every confirmed row.
 */
export async function rewriteAmounts(sourceId: number, file: SourceFile): Promise<void> {
  const valueColumn = columnFor(file, 'value')
  const updates: LocalRow[] = []
  for (const stored of await sourceRowsTable.toArray()) {
    const row = stored.data as SourceRow
    if (row.sourceId !== sourceId) continue

    // Without an amount column there is nothing to transform, so anything previously
    // rewritten goes back to what the file said.
    if (!valueColumn) {
      if (row.importedValue === undefined) continue
      updates.push({ ...stored, data: { ...row, values: { ...row.values }, importedValue: undefined } satisfies SourceRow })
      continue
    }

    const imported = row.importedValue ?? row.values[valueColumn] ?? ''
    const next: SourceRow = { ...row, values: { ...row.values } }
    if (file.signConvention.kind === 'asImported') {
      next.values[valueColumn] = imported
      next.importedValue = undefined
    } else {
      const transformed = applySignConvention(parseNumberValue(imported), file.signConvention, { ...row.values, [valueColumn]: imported })
      next.values[valueColumn] = transformed === null ? imported : String(transformed)
      next.importedValue = imported
    }
    if (next.values[valueColumn] === row.values[valueColumn] && next.importedValue === row.importedValue) continue
    updates.push({ ...stored, data: next })
  }
  if (updates.length > 0) await sourceRowsTable.bulkPut(updates)
}

/** What the file's value column looks like — the evidence a sign decision is made from. */
export async function amountShapeOf(sourceId: number) {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const file = stored.data as SourceFile
  const valueColumn = columnFor(file, 'value')
  if (!valueColumn) return { amountColumn: null, shape: null }
  const rows = (await sourceRowsTable.toArray()).map((row) => row.data as SourceRow).filter((row) => row.sourceId === sourceId)
  return { amountColumn: valueColumn, shape: shapeOfAmounts(rows.map((row) => row.values[valueColumn])) }
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
export function observationsFor(row: SourceRow, file: SourceFile, importedValue?: string): string {
  const assigned = new Set(Object.keys(file.assignments))
  const parts: Record<string, string> = {}
  for (const [column, value] of Object.entries(row.values)) {
    // Every column the file wrote and nothing was assigned to, empty ones included: a
    // blank cell under a named column says the file had nothing to say there, which is
    // itself something the file said. A column with no name is not a column.
    if (assigned.has(column) || !column.trim()) continue
    parts[column] = value
  }
  if (importedValue !== undefined) parts.value_as_imported = importedValue
  return JSON.stringify(parts)
}

/**
 * What the file has not been told, for a row that is otherwise ready to go.
 *
 * Labels say where a row belongs; assignments say which of the file's columns hold the
 * numbers that screen is made of. A row confirmed without them lands with an empty date
 * and an empty value — present in its table, invisible on every dashboard, and only
 * fixable by hand afterwards. So the file is asked for them before the row moves, and the
 * question names the columns that are missing rather than reporting a count of nothing.
 */
export function missingAssignments(row: SourceRow, file: SourceFile, catalogue: LabelCatalogue): string[] {
  const placements = placementsOf(row.labels, catalogue)
  if (placements.length === 0) return []
  const missing: string[] = []

  if (!columnFor(file, 'date')) {
    missing.push(`Assign one of "${file.originalFilename}"'s columns to date: a row without one is on no dashboard, whatever else it says.`)
  }
  if (placements.some((placement) => placement.screen !== INVESTMENTS_SCREEN) && !columnFor(file, 'value')) {
    missing.push(`Assign the column holding the money to value: rows going to ${placements.map((placement) => placement.screen).filter((screen) => screen !== INVESTMENTS_SCREEN).join(', ')} are made of it.`)
  }
  if (placements.some((placement) => placement.screen === INVESTMENTS_SCREEN) && !columnFor(file, 'amount')) {
    missing.push('Assign the column holding how many units were bought or sold to amount: an investment row is a quantity of something, and price is what one unit was worth.')
  }
  return missing
}

/** A row is ready when nothing is missing from it and its labels name somewhere to go. */
function isReady(row: SourceRow, file: SourceFile, catalogue: LabelCatalogue): boolean {
  return ingestionLabelErrors(row.labels, catalogue).length === 0
    && placementsOf(row.labels, catalogue).length > 0
    && missingAssignments(row, file, catalogue).length === 0
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
      labels: {},
    } satisfies SourceRow,
  })
}

/**
 * Edits one of a row's own values.
 *
 * Editing the value edits what the *file* said, not what the convention made of it: the
 * transformation is re-applied to the new value, so a corrected amount ends up signed the
 * same way as every other row in the file rather than escaping the rule.
 */
export async function updateSourceValue(rowId: number, column: string, value: string): Promise<void> {
  const stored = await sourceRowsTable.get(rowId)
  if (!stored) throw new Error(`Source row ${rowId} was not found.`)
  const row = stored.data as SourceRow
  if (column === SOURCE_FILENAME_COLUMN) throw new Error('Where a row came from is not editable.')

  const file = (await sourceFilesTable.get(row.sourceId))?.data as SourceFile | undefined
  const isValue = file ? columnFor(file, 'value') === column : false
  await sourceRowsTable.update(rowId, {
    data: { ...row, values: { ...row.values, [column]: value }, importedValue: isValue ? undefined : row.importedValue } satisfies SourceRow,
  })
  if (file && isValue) await rewriteAmounts(row.sourceId, file)
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
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) throw new Error(`Source file ${sourceId} was not found.`)
  const file = stored.data as SourceFile
  const rows = (await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === sourceId)
  const plan: ConfirmationPlan = { ready: [], incomplete: [], marked: [] }
  for (const record of rows) {
    const row = record.data as SourceRow
    if (row.markedForElimination) { plan.marked.push(record.id); continue }
    if (isReady(row, file, catalogue)) plan.ready.push(record.id)
    else plan.incomplete.push(record.id)
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
    if (!isReady(row, file, catalogue)) { result.leftBehind += 1; continue }
    const placements = placementsOf(row.labels, catalogue)

    const value = parseNumberValue(canonicalValue(row, file, 'value'))
    const base = {
      rowId: row.rowId,
      confirmedAt,
      date: parseDateValue(canonicalValue(row, file, 'date')) ?? undefined,
      value: value ?? undefined,
      observations: observationsFor(row, file, row.importedValue),
      class: row.labels.class?.trim() || undefined,
      category: row.labels.category?.trim() ?? '',
      subcategory: row.labels.subcategory?.trim() ?? '',
      amount: parseNumberValue(canonicalValue(row, file, 'amount')) ?? undefined,
      price: parseNumberValue(canonicalValue(row, file, 'price')) ?? undefined,
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
