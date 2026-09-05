/** The key the file's own name is kept under, inside the condensed column. */
export const SOURCE_FILENAME_KEY = 'source_filename'

/**
 * The condensed column, read back.
 *
 * Everything a file said that no column was assigned to ends up here as JSON, the
 * filename among it — so this is where provenance lives, rather than in a column of its
 * own repeating the same fact. A row whose observations somebody has edited by hand may
 * not be JSON at all, and that is not an error: it reads as holding nothing in
 * particular, which is exactly what it holds.
 */
export function readObservations(observations: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(observations)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === 'string')
        .map(([key, value]) => [key, value as string]),
    )
  } catch {
    return {}
  }
}

/** Which file a confirmed row came from. Empty when its observations no longer say. */
export function sourceFilenameOf(observations: string): string {
  return readObservations(observations)[SOURCE_FILENAME_KEY] ?? ''
}

export function withObservation(observations: string, key: string, value: string): string {
  return JSON.stringify({ ...readObservations(observations), [key]: value })
}
