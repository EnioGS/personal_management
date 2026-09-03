import { comparableText } from './row-query'
import type { Entry, IngestionRow, IngestionSource } from './types'

export type SourceRowMark = 'duplicate' | 'eliminate'

/**
 * Who decided. A scan may revise what a scan said before — the rule it applies keeps
 * improving — but it may never overturn a person's verdict, or the assistant's, which
 * is a judgement about the data rather than a reading of it.
 *
 * Older sources stored the mark alone; those came from a scan, and are read as such.
 */
export interface MarkRecord {
  mark: SourceRowMark
  by: 'scan' | 'person'
}

export function readMark(value: SourceRowMarks[string] | undefined): MarkRecord | undefined {
  if (!value) return undefined
  return typeof value === 'string' ? { mark: value, by: 'scan' } : value
}

export function markValue(value: SourceRowMarks[string] | undefined): SourceRowMark | undefined {
  return readMark(value)?.mark
}

/**
 * How a file's rows are marked before they are staged.
 *
 * `duplicate` is what the system found on its own and nobody has ruled on yet;
 * `eliminate` is a decision — by the user or the assistant — that this row should not
 * enter the worklist at all. Anything unmarked is ready to go.
 */
export type SourceRowMarks = Record<string, SourceRowMark | MarkRecord>

/** Values a row genuinely arrived with. A blank column the ingestion centre added is not evidence. */
export function originalValues(row: Record<string, string>, originalColumns: readonly string[]): Record<string, string> {
  const values: Record<string, string> = {}
  for (const column of originalColumns) {
    const value = comparableText(row[column])
    if (value !== '') values[comparableText(column)] = value
  }
  return values
}

/** The same shape for something already stored, whose keys are whatever its source called them. */
export function storedValues(raw: Record<string, string>): Record<string, string> {
  const values: Record<string, string> = {}
  for (const [key, value] of Object.entries(raw)) {
    const text = comparableText(value)
    if (text !== '') values[comparableText(key)] = text
  }
  return values
}

/**
 * A row is a duplicate when everything it actually carries also appears, identically,
 * on a row that is already stored.
 *
 * Only fields both rows have are compared — two files name their columns differently
 * and one may simply lack a column the other has — but every one of those must agree,
 * which is a stricter test than the cross-file duplicate checker uses. Two fields is
 * the floor: a single matching column is a coincidence, not an identity.
 */
export function isDuplicateOfStored(candidate: Record<string, string>, stored: Record<string, string>[], minimumFields = 2): boolean {
  const keys = Object.keys(candidate)
  if (keys.length === 0) return false
  return stored.some((other) => {
    const shared = keys.filter((key) => other[key] !== undefined)
    if (shared.length < Math.min(minimumFields, keys.length)) return false
    return shared.every((key) => other[key] === candidate[key])
  })
}

/**
 * Everything a new file's rows could already be a copy of.
 *
 * Including *other uploaded files* matters more than it sounds: statements are
 * exported in overlapping periods and dropped in together, so the copy a person most
 * wants caught is usually sitting in the file beside this one — not yet staged, not
 * yet in any table, and therefore invisible to a corpus built only from stored data.
 */
export function buildDuplicateCorpus(
  storedRows: IngestionRow[],
  entries: Entry[],
  otherFiles: { originalColumns: readonly string[]; rows: Record<string, string>[] }[] = [],
): Record<string, string>[] {
  return [
    ...storedRows.map((row) => storedValues(row.rawValues)),
    ...entries.map((entry) => storedValues(Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'tableId' && key !== 'deleted').map(([key, value]) => [key, String(value ?? '')])))),
    ...otherFiles.flatMap((file) => file.rows.map((row) => originalValues(row, file.originalColumns))),
  ]
}

/**
 * Marks the rows of a parsed file that already exist somewhere else.
 *
 * "Already" is meant literally, and it is what keeps this from destroying data: only
 * files imported *before* this one count, so a row shared by two statements is
 * flagged in the later one and kept in the earlier. Flagging both would mean
 * importing the new values from each and losing the row from both.
 *
 * A file can also repeat itself, and there the same rule applies to position: the
 * second occurrence is the copy, the first is the row.
 *
 * Existing marks are never cleared. A scan can say "this looks like a copy"; only a
 * person or the assistant can say "this is one, drop it", and a later scan must not
 * quietly undo that.
 */
export function markDuplicateSourceRows(
  source: IngestionSource,
  fileRows: Record<string, string>[],
  storedRows: IngestionRow[],
  entries: Entry[],
  existing: SourceRowMarks = {},
  earlierFiles: { originalColumns: readonly string[]; rows: Record<string, string>[] }[] = [],
): SourceRowMarks {
  const corpus = buildDuplicateCorpus(storedRows, entries, earlierFiles)
  const marks: SourceRowMarks = { ...existing }
  const seen: Record<string, string>[] = []
  fileRows.forEach((row, index) => {
    const key = String(index)
    const values = originalValues(row, source.originalColumns)
    const held = readMark(marks[key])
    const duplicate = isDuplicateOfStored(values, corpus) || isDuplicateOfStored(values, seen)
    // A scan owns only what a scan wrote, so a verdict it no longer reaches is dropped
    // and a fresh one takes its place — while anything a person decided stays put.
    if (!held || held.by === 'scan') {
      if (duplicate) marks[key] = { mark: 'duplicate', by: 'scan' }
      else if (held?.by === 'scan') delete marks[key]
    }
    seen.push(values)
  })
  return marks
}
