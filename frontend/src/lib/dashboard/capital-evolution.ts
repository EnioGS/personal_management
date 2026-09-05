import { monthKey } from '@/lib/aggregations'
import type { DateRange } from './date-range'

const DAY_MS = 86_400_000

/** One confirmed row, reduced to what a month's arithmetic needs. */
export interface CapitalEntry {
  date: number
  /** Money that moved, signed: negative left, positive arrived. */
  value: number
}

export interface CapitalEvolutionPoint {
  month: string
  /**
   * Everything held, accumulated from the first month there is: every movement and every
   * investment, each month's net added to the last month's total.
   */
  capital: number
  /** The same running total for investments alone — what is held rather than spent. */
  investments: number
  /** What the month itself netted across the accounts. Not cumulative. */
  income: number
  /** What the month spent, as the positive quantity it is. Not cumulative. */
  spending: number
  [key: string]: string | number
}

export interface CapitalSources {
  /** Rows on the movements screen: money entering and leaving the accounts. */
  movements: CapitalEntry[]
  /** Rows on the investments screen: money moving into and out of holdings. */
  investments: CapitalEntry[]
  /** Rows on the spending screens. These are copies of movements, so they never touch capital. */
  spending: CapitalEntry[]
}

function monthStart(month: string): number {
  return Date.parse(`${month}-01`)
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return monthKey(Date.UTC(year, monthNumber, 1))
}

function sumByMonth(entries: CapitalEntry[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (!Number.isFinite(entry.date)) continue
    const month = monthKey(entry.date)
    totals.set(month, (totals.get(month) ?? 0) + entry.value)
  }
  return totals
}

/**
 * Month by month, what was held and what moved.
 *
 * Capital is everything of value held, so it is the running total of every movement and
 * every investment from the first month there is — each month's net added to the last
 * month's total. Spending is deliberately not part of it: a spending row is a copy of the
 * movement that paid for it, and counting both would spend the money twice.
 *
 * The points are then cut to the selected window while the running total keeps the whole
 * history behind it, so a year's chart still starts from what was already there.
 */
export function capitalEvolution(sources: CapitalSources, range: DateRange): CapitalEvolutionPoint[] {
  const movements = sumByMonth(sources.movements)
  const investments = sumByMonth(sources.investments)
  const spending = sumByMonth(sources.spending)

  const months = [...new Set([...movements.keys(), ...investments.keys(), ...spending.keys()])].sort()
  const first = months[0]
  const last = months.at(-1)
  // Both ends came from real timestamps, so the walk below terminates; an unreadable date
  // would sort past every month and never be reached.
  if (!first || !last) return []

  const points: CapitalEvolutionPoint[] = []
  let month = first
  let capital = 0
  let held = 0

  while (month <= last) {
    const income = movements.get(month) ?? 0
    const invested = investments.get(month) ?? 0
    capital = roundCurrency(capital + income + invested)
    held = roundCurrency(held + invested)

    const start = monthStart(month)
    const end = Date.parse(`${nextMonth(month)}-01`) - DAY_MS
    if (end >= range.from && start <= range.to) {
      points.push({
        month,
        capital,
        investments: held,
        income: roundCurrency(income),
        // Spending is reported as the quantity that left, and the rows are negative.
        spending: roundCurrency(-(spending.get(month) ?? 0)),
      })
    }
    month = nextMonth(month)
  }

  return points
}

/** Currency amounts; avoid carrying binary-float dust into later months. */
function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}
