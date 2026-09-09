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

export interface MonthEndProjection {
  /** What the month is expected to close at: what has been spent, plus what is left to come. */
  monthEnd: number
  spentSoFar: number
  /** The rate the remaining days are costed at, per month — the trailing average. */
  baseline: number
  dayOfMonth: number
  daysInMonth: number
  /** How much of the estimate is the month's own rate rather than the baseline, 0 to 1. */
  weight: number
}

/**
 * Where the month in progress ends up.
 *
 * The days that have happened are not estimated — they are what was spent. Only the days
 * left are, and the rate they are costed at is a blend: the month's own rate so far, and
 * the trailing four-month average, weighted by how much of the month has actually
 * happened. On the second of the month one restaurant bill would otherwise project to a
 * catastrophe, and the history is the better evidence; on the twenty-eighth the month is
 * its own evidence and the history says almost nothing. The estimate walks from one to the
 * other as the month fills in, and lands exactly on the truth on the last day.
 */
export function projectMonthEnd(months: SpendingMonth[], today: Date = new Date()): MonthEndProjection | null {
  const current = months.at(-1)
  if (!current || current.month !== currentMonthKey(today)) return null

  const dayOfMonth = today.getDate()
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  // The trailing average ending at the last full month: the same number the tile beside
  // this one draws, so the two agree about what a normal month costs.
  const baseline = trailingAverages(months.slice(0, -1), 'spent', 1)[0] ?? 0
  if (baseline === 0 && current.spent === 0) return null

  const weight = dayOfMonth / daysInMonth
  const ownRate = current.spent / dayOfMonth
  const baselineRate = baseline / daysInMonth
  const rate = weight * ownRate + (1 - weight) * baselineRate

  return {
    monthEnd: current.spent + rate * (daysInMonth - dayOfMonth),
    spentSoFar: current.spent,
    baseline,
    dayOfMonth,
    daysInMonth,
    weight,
  }
}

/**
 * What a month has spent by each day, against the month before it, day for day.
 *
 * The one question a spending screen is opened to answer — am I over, right now — and the
 * only honest way to ask it: the fifteenth of a month is compared with the fifteenth of
 * the last, not with a whole month that had thirty days to accumulate. Both months are the
 * calendar's, so the line stops at today rather than at the last row imported.
 */
export interface SpendingDay {
  day: number
  /** Cumulative spend by that day of the month in progress; null past today. */
  thisMonth: number | null
  lastMonth: number
  /** The same curve averaged over the three complete months before this one. */
  threeMonths: number
  /** And over every complete month the filter holds, which is the period the screen is on. */
  period: number
  [key: string]: string | number | null
}

export function spendingSoFar(rows: FilteredEntry[], today: Date = new Date()): SpendingDay[] {
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

  /** The running total by day of one month, as a 31-long array. */
  const running = (key: string | undefined) => {
    const days = key ? byMonth.get(key) ?? new Map<number, number>() : new Map<number, number>()
    let total = 0
    return Array.from({ length: 31 }, (_, index) => {
      total += days.get(index + 1) ?? 0
      return total
    })
  }

  /**
   * Several months' curves averaged day by day.
   *
   * Day for day, like everything else on this chart: the mean of what each of those months
   * had spent by the fifteenth, not their monthly total divided by thirty. A month is not
   * spent evenly — rent lands on the first and a salary's worth of shopping follows it —
   * and a straight line through the total would flatter the first half of every month.
   */
  const averaged = (keys: string[]) => {
    if (keys.length === 0) return Array.from({ length: 31 }, () => 0)
    const curves = keys.map(running)
    return Array.from({ length: 31 }, (_, index) => curves.reduce((sum, curve) => sum + curve[index], 0) / curves.length)
  }

  // Complete months only, and never the one in progress: an average that included a month
  // three days old would be dragged down by it and stop being a comparison.
  const complete = [...byMonth.keys()].filter((month) => month < current).sort()
  const lastThree = complete.slice(-3)

  const thisMonth = running(current)
  const lastMonth = running(previous)
  const threeMonths = averaged(lastThree)
  const period = averaged(complete)
  // The month in progress stops on today: drawing it flat to the thirty-first would say
  // the spending stopped rather than that the month has not finished. Which also means the
  // line is short against a full previous month, by design.
  const dayOfMonth = today.getDate()

  return Array.from({ length: 31 }, (_, index) => ({
    day: index + 1,
    thisMonth: index + 1 <= dayOfMonth ? thisMonth[index] : null,
    lastMonth: lastMonth[index],
    threeMonths: threeMonths[index],
    period: period[index],
  }))
}
