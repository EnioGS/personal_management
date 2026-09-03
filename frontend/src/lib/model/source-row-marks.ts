import { comparableText } from './row-query'
import type { Entry, IngestionRow, IngestionSource } from './types'

export type SourceRowMark = 'duplicate' | 'eliminate'

/**
 * How a file's rows are marked before they are staged.
 *
 * `duplicate` is what the system found on its own and nobody has ruled on yet;
 * `eliminate` is a decision — by the user or the assistant — that this row should not
 * enter the worklist at all. Anything unmarked is ready to go.
 */
export type SourceRowMarks = Record<string, SourceRowMark>

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
 * Marks every row of a parsed file that already exists elsewhere in the data — in
 * another uploaded file, in the worklist, in the confirmed rows, or in a finance
 * table. Rows already marked keep their mark: a decision to eliminate outranks a
 * fresh scan.
 */
export function markDuplicateSourceRows(
  source: IngestionSource,
  fileRows: Record<string, string>[],
  storedRows: IngestionRow[],
  entries: Entry[],
  existing: SourceRowMarks = {},
  otherFiles: { originalColumns: readonly string[]; rows: Record<string, string>[] }[] = [],
): SourceRowMarks {
  const corpus = buildDuplicateCorpus(storedRows, entries, otherFiles)
  const marks: SourceRowMarks = { ...existing }
  fileRows.forEach((row, index) => {
    const key = String(index)
    if (marks[key] === 'eliminate') return
    const values = originalValues(row, source.originalColumns)
    if (isDuplicateOfStored(values, corpus)) marks[key] = 'duplicate'
    else if (marks[key] === 'duplicate') delete marks[key]
  })
  return marks
}
