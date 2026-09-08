import { monthKey } from '@/lib/aggregations'
import { UNLABELLED_LABEL, type FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

export interface CategoryMonthlyAverage {
  key: string
  label: string
  /** Average per month across every month in the selected range. */
  value: number
  /** Latest-quarter monthly average compared with the full-period one. */
  comparison: number
  /** The same figures for the subcategories inside it, biggest first. */
  children?: CategoryMonthlyAverage[]
}

/** A row nobody has categorised still has to be counted, and counted under something. */
export function categoryOf(row: FilteredEntry): string {
  return row.category.trim() || UNLABELLED_LABEL
}

/** The same for the detail under it, which starts empty far more often than a category does. */
export function subcategoryOf(row: FilteredEntry): string {
  return row.subcategory.trim() || UNLABELLED_LABEL
}

/**
 * Money by category and by the subcategories inside it, as a monthly average.
 *
 * An average rather than a total, so a twenty-four month view is comparable with a twelve
 * month one — a category is not twice as big for having been looked at for twice as long.
 * The comparison is the most recent quarter of the selected months against that average,
 * which is what says whether something is a habit or a recent turn.
 *
 * What counts as an amount is the caller's: spending negates a row and income does not,
 * and a row the caller has no use for is skipped by returning null. Everything else — the
 * bucketing, the nesting, the arithmetic — is the same question asked twice.
 */
export function monthlyAverageByCategory(
  rows: FilteredEntry[],
  selectedMonths: string[],
  amountOf: (row: FilteredEntry) => number | null,
): CategoryMonthlyAverage[] {
  const months = [...new Set(selectedMonths)].sort()
  if (months.length === 0) return []

  const recentMonthCount = Math.max(1, Math.floor(months.length / 4))
  const recentMonths = new Set(months.slice(-recentMonthCount))
  const totals = new Map<string, Aggregate>()

  for (const row of rows) {
    const amount = amountOf(row)
    if (amount === null) continue
    const recent = recentMonths.has(monthKey(row.date))
    const category = add(totals, categoryOf(row), amount, recent)
    add(category.children, subcategoryOf(row), amount, recent)
  }

  const averaged = (entries: Map<string, Aggregate>): CategoryMonthlyAverage[] =>
    [...entries.entries()].map(([label, aggregate]) => ({
      key: label,
      label,
      value: aggregate.total / months.length,
      comparison: (aggregate.recentTotal / recentMonthCount - aggregate.total / months.length) / (aggregate.total / months.length),
      children: aggregate.children.size > 0
        ? averaged(aggregate.children).sort((left, right) => right.value - left.value)
        : undefined,
    }))

  // A category that gave back more than it took over the period is not a category of this
  // kind at all — a refund, a credit adjustment, a row labelled from the money's point of
  // view. Left off rather than drawn as a negative bar among the things that were not.
  return averaged(totals).filter((category) => category.value > 0)
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
