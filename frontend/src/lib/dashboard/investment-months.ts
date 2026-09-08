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
 * A row the holdings paid out rather than one that moved money between pots.
 *
 * The only signal a cash-flow file gives is what it calls things, so this reads the words
 * — imperfect, and the reason the figure is labelled as what was received rather than as a
 * return. A return needs a valuation, and nothing here has one.
 */
export function isProceeds(row: FilteredEntry): boolean {
  const text = `${row.class ?? ''} ${row.subcategory} ${row.category} ${row.observations}`.toLowerCase()
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
