/**
 * Which columns of the profile metrics table are put away.
 *
 * A UI preference like the theme and the language: it survives leaving the screen, and it
 * travels in the export, because a table restored with twenty-eight columns showing is not
 * the table the person had set up. Kept in localStorage for the same reason those are —
 * `preferences-table` dresses it as a row so the export machinery carries it unchanged.
 */
export const METRIC_COLUMNS_STORAGE_KEY = 'hiddenMetricColumns'

export function readHiddenColumns(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(METRIC_COLUMNS_STORAGE_KEY) ?? '[]')
    return Array.isArray(stored) ? stored.filter((entry): entry is string => typeof entry === 'string') : []
  } catch {
    // A preference nobody can read is a preference nobody set: show everything.
    return []
  }
}

export function writeHiddenColumns(columns: string[]): void {
  localStorage.setItem(METRIC_COLUMNS_STORAGE_KEY, JSON.stringify(columns))
}
