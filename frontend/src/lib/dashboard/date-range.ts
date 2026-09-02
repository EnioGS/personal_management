/** A closed date range in epoch ms, inclusive on both ends. */
export interface DateRange {
  from: number
  to: number
}

export type DateRangePreset = 'last30' | 'last90' | 'thisYear' | 'custom'

const DAY_MS = 86_400_000

/** Midnight UTC of `date` — matches how this app stores dates (see lib/aggregations.ts). */
function startOfDayUtc(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

/**
 * Resolves a preset to a concrete range as of `now` (defaults to the real current
 * time — overridable for tests). `custom` has no fixed resolution and must be paired
 * with an explicit range from the caller; asking for it here is a programming error.
 */
export function resolvePreset(preset: Exclude<DateRangePreset, 'custom'>, now: Date = new Date()): DateRange {
  const to = startOfDayUtc(now) + DAY_MS - 1 // end of today, inclusive
  switch (preset) {
    case 'last30':
      return { from: to - 30 * DAY_MS, to }
    case 'last90':
      return { from: to - 90 * DAY_MS, to }
    case 'thisYear':
      return { from: Date.UTC(now.getUTCFullYear(), 0, 1), to }
  }
}

export function isWithinRange(dateMs: number, range: DateRange): boolean {
  return dateMs >= range.from && dateMs <= range.to
}
