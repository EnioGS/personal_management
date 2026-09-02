import { monthKey } from '@/lib/aggregations'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

export interface MonthlySpend {
  month: string
  amount: number
  [key: string]: string | number
}

export interface CategorySpendChange {
  category: string
  /** Spend that increased since the preceding calendar month. */
  increased: number
  /** Spend that decreased since the preceding calendar month. */
  decreased: number
  [key: string]: string | number
}

export interface DescriptionFrequency {
  label: string
  count: number
  total: number
}

export interface CategoryMonthlyAverage {
  key: string
  label: string
  /** Average monthly spend across every month in the selected range. */
  value: number
  /** Latest-quarter monthly average compared with the full selected-period average. */
  comparison: number
}

/**
 * Credit-card categories, normalized to a monthly average so a 24-month view is
 * comparable with a 12-month one. The trend compares the most recent quarter of
 * selected months with that full-period monthly average.
 */
export function averageCardSpendByCategory(rows: FilteredEntry[], selectedMonths: string[]): CategoryMonthlyAverage[] {
  const months = [...new Set(selectedMonths)].sort()
  if (months.length === 0) return []

  const recentMonthCount = Math.max(1, Math.floor(months.length / 4))
  const recentMonths = new Set(months.slice(-recentMonthCount))
  const totals = new Map<string, { total: number; recentTotal: number }>()

  for (const row of rows) {
    if (!isSpendingRow(row) || row.cardId === undefined) continue
    const month = monthKey(row.date)
    const aggregate = totals.get(row.category) ?? { total: 0, recentTotal: 0 }
    const amount = row.spendingTreatment === 'rebate' ? -row.amount : row.amount
    aggregate.total += amount
    if (recentMonths.has(month)) aggregate.recentTotal += amount
    totals.set(row.category, aggregate)
  }

  return [...totals.entries()].map(([category, aggregate]) => {
    const value = aggregate.total / months.length
    const recentAverage = aggregate.recentTotal / recentMonthCount
    return { key: category, label: category, value, comparison: (recentAverage - value) / value }
  })
}

/** Refunds and credits are not spending, even when their source table is a card ledger. */
export function outgoingSpending(rows: FilteredEntry[]): FilteredEntry[] {
  return rows.filter(isSpendingRow)
}

/** Only an explicitly labelled spending row counts, whichever table it came from. */
function isSpendingRow(row: FilteredEntry): boolean {
  return row.financeDestination === 'spending' && (row.spendingTreatment === 'expense' || row.spendingTreatment === 'rebate')
}

export function spendingByMonth(rows: FilteredEntry[]): MonthlySpend[] {
  const totals = new Map<string, number>()
  for (const row of rows) {
    const month = monthKey(row.date)
    totals.set(month, (totals.get(month) ?? 0) + row.amount)
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
    target.set(row.category, (target.get(row.category) ?? 0) + row.amount)
  }

  return [...new Set([...current.keys(), ...preceding.keys()])]
    .map((category) => {
      const change = (current.get(category) ?? 0) - (preceding.get(category) ?? 0)
      return { category, increased: Math.max(change, 0), decreased: Math.max(-change, 0) }
    })
    .filter((row) => row.increased > 0 || row.decreased > 0)
    .sort((a, b) => Math.max(b.increased, b.decreased) - Math.max(a.increased, a.decreased))
}

export function frequentDescriptions(rows: FilteredEntry[]): DescriptionFrequency[] {
  const totals = new Map<string, DescriptionFrequency>()
  for (const row of rows) {
    const label = row.description.trim() || row.category
    const aggregate = totals.get(label) ?? { label, count: 0, total: 0 }
    aggregate.count += 1
    aggregate.total += row.amount
    totals.set(label, aggregate)
  }
  return [...totals.values()].sort((a, b) => b.count - a.count || b.total - a.total || a.label.localeCompare(b.label))
}
