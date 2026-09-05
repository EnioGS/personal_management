/**
 * A row's identity, fixed for life.
 *
 * Hashed from the row's contents *and* a random seed, so two identical rows in one file
 * — which a bank may legitimately report — get different ids. Once assigned it never
 * changes, however much of the row is later edited: the id is what a correction reuses
 * and what ties copies of one row across the tables it was placed in.
 */
export function newRowId(contents: Record<string, unknown> = {}): string {
  const text = Object.entries(contents)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value ?? '')}`)
    .join(' ')
  const seed = crypto.getRandomValues(new Uint32Array(2))
  return `${hash(`${text} ${seed[0]}${seed[1]}`)}${hash(`${seed[1]}${text}`)}`
}

/** FNV-1a, hex — short, stable, and not pretending to be a cryptographic digest. */
function hash(text: string): string {
  let value = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index)
    value = Math.imul(value, 0x01000193) >>> 0
  }
  return value.toString(16).padStart(8, '0')
}
