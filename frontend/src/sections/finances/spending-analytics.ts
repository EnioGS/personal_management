import { monthKey } from '@/lib/aggregations'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { categoryOf, monthlyAverageByCategory, type CategoryMonthlyAverage } from '@/lib/dashboard/category-averages'



export interface MonthlySpend {
  month: string
  amount: number
  [key: string]: string | number
}

export interface CategorySpendChange {
  category: string
  /**
   * What the category moved by, signed: up is more spent, down is less.
   *
   * One number rather than two, because a category did one thing or the other — drawn as
   * two series it took two slots, one of them always empty, which read as a chart where
   * every category had a bar missing.
   */
  change: number
  [key: string]: string | number
}

export interface DescriptionFrequency {
  label: string
  count: number
  total: number
}

/**
 * Spending by category, as a monthly average — the shared reckoning, told which rows are
 * spending and how much of each one left.
 */
export function averageSpendByCategory(rows: FilteredEntry[], selectedMonths: string[]): CategoryMonthlyAverage[] {
  return monthlyAverageByCategory(rows, selectedMonths, (row) => (isSpendingRow(row) ? -row.value : null))
}

/** Every row confirmed onto a spending screen, refunds included — their sign undoes them. */
export function outgoingSpending(rows: FilteredEntry[]): FilteredEntry[] {
  return rows.filter(isSpendingRow)
}

/**
 * A spending row is one confirmed onto a spending screen. Its sign says the rest: money
 * out is spend, money back is a refund that subtracts from it.
 *
 * With one exception, which is not a refund at all: the line that settles the card's
 * bill. It arrives on the statement as a credit the size of everything above it, and the
 * same event is already in the bank as the payment that left the account. Counted here it
 * cancels the purchases it paid for — a screen of real spending netting to nothing — and
 * lands under whatever the payment was labelled, which is why "income" and "transfer"
 * showed up among the categories. Refunds, IOF returned, and credit adjustments are left
 * alone: those really do give money back on something bought.
 */
function isSpendingRow(row: FilteredEntry): boolean {
  return row.screen === 'spending' && !isBillPayment(row)
}

/** "Pagamento recebido", however the statement spells it. */
const BILL_PAYMENT = /pagamento\s+recebido/i

export function isBillPayment(row: FilteredEntry): boolean {
  return row.value > 0 && BILL_PAYMENT.test(row.description)
}

export function spendingByMonth(rows: FilteredEntry[]): MonthlySpend[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const month = monthKey(row.date)
    // Spend is reported as a positive quantity; the rows that make it up are negative.
    totals.set(month, (totals.get(month) ?? 0) - row.value)
  }
  return [...totals.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month, amount }))
}

/** How far back the category chart looks, in months of thirty days each. */
export type SpendingWindow = 1 | 3 | 6

/**
 * Each category's recent rate against its own long-run rate.
 *
 * "This month vs. the one before" compared two arbitrary samples: a month with five
 * weekends against one with four, a category billed on the 29th against a month with 28
 * days. This asks the question that survives that — is this category running above or
 * below what it usually costs — by putting the last N thirty-day periods, expressed as a
 * monthly rate, against the monthly rate across everything the filter holds.
 *
 * Thirty-day periods rather than calendar months, and anchored on the last row rather than
 * on today, because the window is about the data: three months of it is ninety days back
 * from wherever it ends, whether or not the calendar agrees.
 */
export function categoryVsAverage(rows: FilteredEntry[], months: SpendingWindow): CategorySpendChange[] {
  if (rows.length === 0) return []

  const dates = rows.map((row) => new Date(row.date).getTime()).filter((time) => Number.isFinite(time))
  if (dates.length === 0) return []
  const end = Math.max(...dates)
  const start = end - months * 30 * 24 * 60 * 60 * 1000
  // The long-run rate is per month of data held, so a category is compared with itself
  // rather than with how long the filter happens to be.
  const monthsHeld = new Set(rows.map((row) => monthKey(row.date))).size || 1

  const recent = new Map<string, number>()
  const overall = new Map<string, number>()
  for (const row of rows) {
    const category = categoryOf(row)
    // Magnitudes, like everything else this screen reports: spending rows are negative.
    overall.set(category, (overall.get(category) ?? 0) - row.value)
    if (new Date(row.date).getTime() >= start) recent.set(category, (recent.get(category) ?? 0) - row.value)
  }

  return [...overall.keys()]
    .map((category) => ({
      category,
      change: (recent.get(category) ?? 0) / months - (overall.get(category) ?? 0) / monthsHeld,
    }))
    .filter((row) => Math.abs(row.change) >= 0.005)
    .sort((left, right) => Math.abs(right.change) - Math.abs(left.change))
}

export function frequentDescriptions(rows: FilteredEntry[]): DescriptionFrequency[] {
  const totals = new Map<string, DescriptionFrequency>()
  for (const row of rows) {
    const label = row.description.trim() || categoryOf(row)
    const aggregate = totals.get(label) ?? { label, count: 0, total: 0 }
    aggregate.count += 1
    aggregate.total -= row.value
    totals.set(label, aggregate)
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || b.total - a.total || a.label.localeCompare(b.label))
}
