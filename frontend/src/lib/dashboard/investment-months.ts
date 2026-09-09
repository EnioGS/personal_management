import { monthKey } from '@/lib/aggregations'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { classOf, heldDelta } from './holdings-split'
import type { MonthlyPoint } from './capital-metric'

export interface InvestmentMonth extends MonthlyPoint {
  month: string
  /** What is held at the end of that month, by class and altogether. Running totals. */
  cash: number
  fixedIncome: number
  variableIncome: number
  unclassified: number
  held: number
  /** What the holdings paid out that month — interest, dividends. Not cumulative. */
  received: number
}

const INCOME_WORDS = ['juros', 'rendimento', 'provento', 'dividend', 'income', 'proceed', 'yield']
/**
 * The class names, removed before the words are read.
 *
 * "Fixed income" says what a holding is, not that it paid anything out, and it contains
 * the word this test looks for — so every redemption of a Tesouro paper was being counted
 * as interest received, which is how a screen reports nine thousand of income nobody had.
 */
const CLASS_PHRASES = /fixed income|variable income|renda fixa|renda vari[áa]vel/g

/**
 * A row the holdings paid out rather than one that moved money between pots.
 *
 * The only signal a cash-flow file gives is what it calls things, so this reads the words
 * — imperfect, and the reason the figure is labelled as what was received rather than as a
 * return. A return needs a valuation, and nothing here has one.
 */
export function isProceeds(row: FilteredEntry): boolean {
  const text = `${row.class ?? ''} ${row.subcategory} ${row.category} ${row.observations}`
    .toLowerCase()
    .replace(CLASS_PHRASES, ' ')
  return row.value > 0 && INCOME_WORDS.some((word) => text.includes(word))
}

/**
 * Holdings month by month: what is held, in what, and what it paid out.
 *
 * Every month between the first and the last is walked, empty ones included, because a
 * holding held through a quiet month is still held — a series that skipped those would
 * draw a portfolio that vanished and came back.
 */
export function investmentMonths(rows: FilteredEntry[]): InvestmentMonth[] {
  if (rows.length === 0) return []
  const byMonth = new Map<string, { deltas: Record<string, number>; received: number }>()

  for (const row of rows) {
    if (!Number.isFinite(row.date)) continue
    const key = monthKey(row.date)
    const month = byMonth.get(key) ?? { deltas: { cash: 0, fixedIncome: 0, variableIncome: 0, unclassified: 0 }, received: 0 }
    month.deltas[classOf(row)] += heldDelta(row)
    if (isProceeds(row)) month.received += row.value
    byMonth.set(key, month)
  }

  const months = [...byMonth.keys()].sort()
  const first = months[0]
  const last = months.at(-1)
  if (!first || !last) return []

  const points: InvestmentMonth[] = []
  const running = { cash: 0, fixedIncome: 0, variableIncome: 0, unclassified: 0 }
  let month = first
  while (month <= last) {
    const entry = byMonth.get(month)
    for (const key of Object.keys(running) as (keyof typeof running)[]) {
      running[key] = round(running[key] + (entry?.deltas[key] ?? 0))
    }
    points.push({
      month,
      ...running,
      held: round(running.cash + running.fixedIncome + running.variableIncome + running.unclassified),
      received: round(entry?.received ?? 0),
    })
    month = nextMonth(month)
  }
  return points
}

function nextMonth(month: string): string {
  const [year, number] = month.split('-').map(Number)
  return monthKey(Date.UTC(year, number, 1))
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export interface InvestmentFlowMonth {
  month: string
  /** What went into the holdings that month, and what came out of them, as it moved. */
  added: number
  removed: number
  [key: string]: string | number
}

/**
 * What was put in and taken out, month by month.
 *
 * The lines above are levels — where the pot stood at the end of each month — and a level
 * moves for two reasons a cash-flow file cannot tell apart on sight: money was added, or
 * money was withdrawn. This is the movement itself, drawn around zero, and it is the only
 * thing on this screen that says whether a flat portfolio was untouched or busy.
 *
 * Payouts are left out: what a holding pays is not a contribution to it, and it is already
 * drawn beside the levels.
 */
export function investmentFlows(rows: FilteredEntry[]): InvestmentFlowMonth[] {
  const byMonth = new Map<string, InvestmentFlowMonth>()

  for (const row of rows) {
    if (!Number.isFinite(row.date) || isProceeds(row)) continue
    const delta = heldDelta(row)
    if (delta === 0) continue
    const key = monthKey(row.date)
    const month = byMonth.get(key) ?? { month: key, added: 0, removed: 0 }
    if (delta > 0) month.added += delta
    else month.removed += delta
    byMonth.set(key, month)
  }

  return [...byMonth.values()].sort((left, right) => left.month.localeCompare(right.month))
}