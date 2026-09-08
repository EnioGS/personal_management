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
   * Everything held, accumulated from the first month there is: what the accounts did and
   * what is held in investments, each month's net added to the last month's total.
   */
  capital: number
  /**
   * What is held in investments rather than in the accounts, as a positive quantity.
   *
   * The rows are written from the account's point of view — an aplicação is money leaving
   * it, a resgate money coming back — so what is *held* is the negative of their running
   * sum. Inverted here rather than in the rows themselves: the tables keep saying what the
   * broker said.
   */
  investments: number
  /** What the month itself netted across the accounts. Not cumulative. */
  income: number
  /** What left the accounts that month, as the positive quantity it is. Not cumulative. */
  spending: number
  /** What arrived that month, likewise positive. `arrived` less `spending` is `income`. */
  arrived: number
  [key: string]: string | number
}

export interface CapitalSources {
  /** Rows on the movements screen: money entering and leaving the accounts. */
  movements: CapitalEntry[]
  /**
   * What each investment row added to the holdings, already signed as a holding rather
   * than as the cash movement it was written as — see `heldDelta`, which knows the
   * classes and so knows which end of the transfer a row is describing.
   */
  investments: CapitalEntry[]
}

function monthStart(month: string): number {
  return Date.parse(`${month}-01`)
}

function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return monthKey(Date.UTC(year, monthNumber, 1))
}

function sumByMonth(entries: CapitalEntry[], keep: (value: number) => boolean = () => true): Map<string, number> {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    if (!Number.isFinite(entry.date)) continue
    if (!keep(entry.value)) continue
    const month = monthKey(entry.date)
    totals.set(month, (totals.get(month) ?? 0) + entry.value)
  }
  return totals
}

/**
 * Month by month, what was held and what moved.
 *
 * Capital is everything of value held, so it is the running total of what the accounts did
 * and what is held in investments, from the first month there is — each month's net added
 * to the last month's total. The investment entries arrive already signed as holdings, so
 * money placed in a fund adds to capital rather than subtracting from it: placing money
 * moves it between two of your own pockets, and the movement out of the account that paid
 * for it is the other half of the same sum.
 *
 * The movements are the whole story of the accounts, spending included: a card bill and a
 * Pix both leave as movements, and what left is already netted off by summing a month's
 * ins and outs. So spending here is read off the movements too — the negative half of the
 * same rows — rather than off the spending screen, whose rows are the itemisation of bills
 * the movements have already paid. Counting both would spend every purchase twice.
 *
 * The points are then cut to the selected window while the running total keeps the whole
 * history behind it, so a year's chart still starts from what was already there.
 */
export function capitalEvolution(sources: CapitalSources, range: DateRange): CapitalEvolutionPoint[] {
  const movements = sumByMonth(sources.movements)
  const investments = sumByMonth(sources.investments)
  const outgoing = sumByMonth(sources.movements, (value) => value < 0)
  const incoming = sumByMonth(sources.movements, (value) => value > 0)

  const months = [...new Set([...movements.keys(), ...investments.keys()])].sort()
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
        spending: roundCurrency(-(outgoing.get(month) ?? 0)),
        arrived: roundCurrency(incoming.get(month) ?? 0),
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
