import { monthKey } from '@/lib/aggregations'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import type { MonthlyPoint } from './capital-metric'

export interface SpendingMonth extends MonthlyPoint {
  month: string
  /** What left that month, as the positive quantity it is. */
  spent: number
  /** The part of it that repeats: subscriptions, instalments, anything with a recurrence. */
  committed: number
  /** How many rows it took, which says whether a month was one big thing or many small ones. */
  entries: number
}

/**
 * Spending month by month, and how much of each month was already decided.
 *
 * `committed` is the part a person cannot change this month without cancelling something —
 * a subscription, an instalment — and it is the difference between a month that was
 * expensive and a month that was *chosen* to be expensive. Everything else on this screen
 * is read against it.
 */
export function spendingMonths(rows: FilteredEntry[], isCommitted: (row: FilteredEntry) => boolean): SpendingMonth[] {
  const months = new Map<string, SpendingMonth>()
  for (const row of rows) {
    if (row.value >= 0) continue
    const key = monthKey(row.date)
    const month = months.get(key) ?? { month: key, spent: 0, committed: 0, entries: 0 }
    month.spent += -row.value
    if (isCommitted(row)) month.committed += -row.value
    month.entries += 1
    months.set(key, month)
  }
  return [...months.values()].sort((left, right) => left.month.localeCompare(right.month))
}

/**
 * What a month has spent by each day, against the month before it, day for day.
 *
 * The one question a spending screen is opened to answer — am I over, right now — and the
 * only honest way to ask it: the fifteenth of a month is compared with the fifteenth of
 * the last, not with a whole month that had thirty days to accumulate.
 */
export function spendingSoFar(rows: FilteredEntry[]): { day: number; thisMonth: number | null; lastMonth: number }[] {
  const byMonth = new Map<string, Map<number, number>>()
  for (const row of rows) {
    if (row.value >= 0) continue
    const key = monthKey(row.date)
    const day = new Date(row.date).getUTCDate()
    const days = byMonth.get(key) ?? new Map<number, number>()
    days.set(day, (days.get(day) ?? 0) + -row.value)
    byMonth.set(key, days)
  }

  const months = [...byMonth.keys()].sort()
  const current = months.at(-1)
  const previous = months.at(-2)
  if (!current) return []

  const running = (key: string | undefined) => {
    const days = key ? byMonth.get(key) ?? new Map<number, number>() : new Map<number, number>()
    let total = 0
    return Array.from({ length: 31 }, (_, index) => {
      total += days.get(index + 1) ?? 0
      return total
    })
  }

  const thisMonth = running(current)
  const lastMonth = running(previous)
  // The current month stops where it has got to: drawing it flat to the thirty-first would
  // say the spending stopped rather than that the month has not finished.
  const today = Math.max(...[...(byMonth.get(current)?.keys() ?? [1])])

  return Array.from({ length: 31 }, (_, index) => ({
    day: index + 1,
    thisMonth: index + 1 <= today ? thisMonth[index] : null,
    lastMonth: lastMonth[index],
  }))
}
