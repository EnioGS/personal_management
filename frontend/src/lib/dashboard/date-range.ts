/** A closed date range in epoch ms, inclusive on both ends. */
export interface DateRange {
  from: number
  to: number
}

export type DateRangePreset = 'thisYear' | 'last12Months' | 'last24Months' | 'custom'

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
    case 'thisYear':
      return { from: Date.UTC(now.getUTCFullYear(), 0, 1), to }
    // Calendar-month windows keep every monthly bar complete except the current
    // month, instead of producing arbitrary 30-day fragments at the range start.
    case 'last12Months':
      return { from: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1), to }
    case 'last24Months':
      return { from: Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 23, 1), to }
  }
}

export function isWithinRange(dateMs: number, range: DateRange): boolean {
  return dateMs >= range.from && dateMs <= range.to
}

/**
 * The immediately preceding range of the same length — "vs. last period" for a KPI
 * delta. The preceding range has the same concrete length as the selected one; the
 * two ranges are adjacent, so a percentage change compares like with like.
 */
export function previousEquivalentRange(range: DateRange): DateRange {
  const length = range.to - range.from + 1
  return { from: range.from - length, to: range.from - 1 }
}
