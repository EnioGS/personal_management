/**
 * Reads the date shapes this app actually receives, in one place.
 *
 * Brazilian statements write 15/08/2025, which `Date.parse` reads as month 15 and
 * rejects outright — so a whole file's dates silently became "no date at all",
 * blocking promotion and, worse, making the duplicate checker compare two rows on
 * amount and description alone and call a July charge a match for an August one.
 *
 * Day-first is the assumption for a slash/dot/dash date, because that is what the
 * banks this app reads write. When the first number cannot be a day but the second
 * can, the two are swapped rather than refused.
 */
const DAY_FIRST = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/

export function parseDateValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').trim()
  if (!text) return null

  // A stored epoch that has been through a CSV comes back as a string of digits.
  if (/^\d{11,}$/.test(text)) {
    const epoch = Number(text)
    return Number.isFinite(epoch) ? epoch : null
  }

  const dayFirst = DAY_FIRST.exec(text)
  if (dayFirst) {
    const [, first, second, year] = dayFirst
    const [day, month] = Number(first) > 12 || Number(second) <= 12 ? [Number(first), Number(second)] : [Number(second), Number(first)]
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    const ms = Date.UTC(Number(year), month - 1, day)
    // Rejects the 31st of a 30-day month rather than rolling it into the next one.
    return new Date(ms).getUTCDate() === day ? ms : null
  }

  const parsed = Date.parse(text)
  return Number.isNaN(parsed) ? null : parsed
}
