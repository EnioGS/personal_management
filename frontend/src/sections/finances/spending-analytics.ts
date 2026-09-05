import { monthKey } from '@/lib/aggregations'
import { UNLABELLED_LABEL, type FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

/** A row nobody has categorised still has to be counted, and counted under something. */
function categoryOf(row: FilteredEntry): string {
  return row.category.trim() || UNLABELLED_LABEL
}

/** The same for the detail under it, which starts empty far more often than a category does. */
function subcategoryOf(row: FilteredEntry): string {
  return row.subcategory.trim() || UNLABELLED_LABEL
}

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
  /** The same figures for the subcategories inside it, biggest first. */
  children?: CategoryMonthlyAverage[]
}

/**
 * Spending categories, normalized to a monthly average so a 24-month view is
 * comparable with a 12-month one. The trend compares the most recent quarter of
 * selected months with that full-period monthly average.
 */
export function averageSpendByCategory(rows: FilteredEntry[], selectedMonths: string[]): CategoryMonthlyAverage[] {
  const months = [...new Set(selectedMonths)].sort()
  if (months.length === 0) return []

  const recentMonthCount = Math.max(1, Math.floor(months.length / 4))
  const recentMonths = new Set(months.slice(-recentMonthCount))
  const totals = new Map<string, Aggregate>()

  for (const row of rows) {
    if (!isSpendingRow(row)) continue
    const recent = recentMonths.has(monthKey(row.date))
    const amount = -row.value
    const category = add(totals, categoryOf(row), amount, recent)
    add(category.children, subcategoryOf(row), amount, recent)
  }

  const averaged = (entries: Map<string, Aggregate>): CategoryMonthlyAverage[] =>
    [...entries.entries()]
      .map(([label, aggregate]) => {
        const value = aggregate.total / months.length
        const recentAverage = aggregate.recentTotal / recentMonthCount
        return {
          key: label,
          label,
          value,
          comparison: (recentAverage - value) / value,
          children: aggregate.children.size > 0 ? averaged(aggregate.children).sort((left, right) => right.value - left.value) : undefined,
        }
      })

  return averaged(totals)
}

interface Aggregate {
  total: number
  recentTotal: number
  children: Map<string, Aggregate>
}

/** Adds an amount to a bucket, creating it the first time anything lands there. */
function add(buckets: Map<string, Aggregate>, key: string, amount: number, recent: boolean): Aggregate {
  const aggregate = buckets.get(key) ?? { total: 0, recentTotal: 0, children: new Map<string, Aggregate>() }
  aggregate.total += amount
  if (recent) aggregate.recentTotal += amount
  buckets.set(key, aggregate)
  return aggregate
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
      const change = (current.get(category) ?? 0) - (preceding.get(category) ?? 0)
      return { category, increased: Math.max(change, 0), decreased: Math.max(-change, 0) }
    })
    .filter((row) => row.increased > 0 || row.decreased > 0)
    .sort((a, b) => Math.max(b.increased, b.decreased) - Math.max(a.increased, a.decreased))
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
