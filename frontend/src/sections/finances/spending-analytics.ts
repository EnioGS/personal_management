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

function previousMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * The latest month represented by the filtered data against its immediately preceding
 * calendar month. Categories are sorted by the size of their movement, not alphabetically.
 */
export function categorySpendChanges(rows: FilteredEntry[]): CategorySpendChange[] {
  const latestMonth = spendingByMonth(rows).at(-1)?.month
  if (!latestMonth) return []

  const current = new Map<string, number>()
  const preceding = new Map<string, number>()
  const precedingMonth = previousMonth(latestMonth)

  for (const row of rows) {
    const target = monthKey(row.date) === latestMonth ? current : monthKey(row.date) === precedingMonth ? preceding : null
    if (!target) continue
    // Magnitudes, like everything else this screen reports: spending rows are negative.
    target.set(categoryOf(row), (target.get(categoryOf(row)) ?? 0) - row.value)
  }

  return [...new Set([...current.keys(), ...preceding.keys()])]
    .map((category) => {
      return { category, change: (current.get(category) ?? 0) - (preceding.get(category) ?? 0) }
    })
    .filter((row) => row.change !== 0)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
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
