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

/** The calendar month a date falls in, and the one before it. */
export function currentMonthKey(today: Date = new Date()): string {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
}

export function monthBefore(month: string): string {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * The months, run through to the calendar month today falls in.
 *
 * "This month" means the month it is, not the last month the data happens to reach. A
 * vault whose last import was in July should say July is over and August has spent
 * nothing, rather than presenting July as the month in progress — and a month with no
 * rows in it yet is a real answer, not a missing one.
 */
export function monthsThroughToday(months: SpendingMonth[], today: Date = new Date()): SpendingMonth[] {
  const current = currentMonthKey(today)
  const known = months.filter((month) => month.month <= current)
  if (known.at(-1)?.month === current) return known
  return [...known, { month: current, spent: 0, committed: 0, entries: 0 }]
}

/**
 * A trailing average, one point per month, ending at the month given.
 *
 * A sparkline of monthly totals shows the noise; this shows the level. Each point is the
 * mean of that month and the `window - 1` before it, so a single expensive month lifts
 * four points a little rather than one point a lot, and the shape of the line is the
 * direction of travel rather than the shape of the last thing that happened.
 */
export function trailingAverages(
  months: SpendingMonth[],
  metric: 'spent' | 'committed' = 'spent',
  points = 4,
  window = 4,
): number[] {
  const last = months.at(-1)?.month
  if (!last) return []
  const by = new Map(months.map((month) => [month.month, month[metric]]))

  const keys: string[] = [last]
  while (keys.length < points) keys.unshift(monthBefore(keys[0]))

  return keys.map((key) => {
    let month = key
    let total = 0
    for (let step = 0; step < window; step++) {
      total += by.get(month) ?? 0
      month = monthBefore(month)
    }
    return total / window
  })
}

/**
 * What a month has spent by each day, against the month before it, day for day.
 *
 * The one question a spending screen is opened to answer — am I over, right now — and the
 * only honest way to ask it: the fifteenth of a month is compared with the fifteenth of
 * the last, not with a whole month that had thirty days to accumulate. Both months are the
 * calendar's, so the line stops at today rather than at the last row imported.
 */
export function spendingSoFar(rows: FilteredEntry[], today: Date = new Date()): { day: number; thisMonth: number | null; lastMonth: number }[] {
  const byMonth = new Map<string, Map<number, number>>()
  for (const row of rows) {
    if (row.value >= 0) continue
    const key = monthKey(row.date)
    const day = new Date(row.date).getUTCDate()
    const days = byMonth.get(key) ?? new Map<number, number>()
    days.set(day, (days.get(day) ?? 0) + -row.value)
    byMonth.set(key, days)
  }

  const current = currentMonthKey(today)
  const previous = monthBefore(current)
  // A month in progress with nothing in it yet is a real answer and still worth drawing
  // against the month before it. Two empty months are nothing to draw.
  if (!byMonth.has(current) && !byMonth.has(previous)) return []

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
  // The month in progress stops on today: drawing it flat to the thirty-first would say
  // the spending stopped rather than that the month has not finished. Which also means the
  // line is short against a full previous month, by design.
  const dayOfMonth = today.getDate()

  return Array.from({ length: 31 }, (_, index) => ({
    day: index + 1,
    thisMonth: index + 1 <= dayOfMonth ? thisMonth[index] : null,
    lastMonth: lastMonth[index],
  }))
}
