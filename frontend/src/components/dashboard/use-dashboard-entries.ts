import { useMemo } from 'react'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { useConfirmedRowsStore } from '@/lib/model/model-stores'
import type { ConfirmedRow } from '@/lib/model/types'
import { isWithinRange } from '@/lib/dashboard/date-range'
import { resolveFilterRange, type DashboardFilters } from './dashboard-filters'

export interface FilteredEntry {
  rowId: string
  section: string
  screen: string
  date: number
  /** Signed the way the app means it: negative left, positive arrived. */
  amount: number
  category: string
  subcategory: string
  /** Everything the source file said that no column was assigned to. */
  observations: string
  /** The most description-like thing the file said — see `describeRow`. */
  description: string
  sourceFilename: string
  asset?: string
  quantity?: number
  price?: number
  investmentType?: string
  investmentClass?: string
}

interface FilterParams {
  rows: StoredRow<ConfirmedRow>[]
  filters: DashboardFilters
  /** Limits to one screen; omitted, every screen counts (which is what capital wants). */
  screen?: string
}

/**
 * The confirmed rows a screen should draw.
 *
 * Two rules do all the work here. A row marked for elimination is invisible to every
 * dashboard while staying in its table — the one place this app hides anything, and the
 * reason marking is safe to hand out. And a row confirmed onto several screens exists
 * once per screen, so anything counting across screens has to count each `rowId` once;
 * `dedupeByRow` is what capital uses and a single screen does not need.
 */
export function filterConfirmedRows({ rows, filters, screen }: FilterParams): FilteredEntry[] {
  const range = resolveFilterRange(filters)
  const result: FilteredEntry[] = []

  for (const row of rows) {
    if (row.markedForElimination) continue
    if (screen && row.screen !== screen) continue
    if (typeof row.date !== 'number' || !isWithinRange(row.date, range)) continue
    if (filters.categories.length > 0 && !filters.categories.includes(row.category)) continue

    result.push({
      rowId: row.rowId,
      section: row.section,
      screen: row.screen,
      date: row.date,
      amount: typeof row.amount === 'number' ? row.amount : 0,
      category: row.category,
      subcategory: row.subcategory,
      observations: row.observations,
      description: describeRow(row.observations),
      sourceFilename: row.sourceFilename,
      asset: row.asset,
      quantity: row.quantity,
      price: row.price,
      investmentType: row.investmentType,
      investmentClass: row.investmentClass,
    })
  }
  return result
}

/**
 * What a row would call itself.
 *
 * Nothing is assigned to a description any more: a file's own columns are assigned to
 * the fields the app computes with, and everything else is kept verbatim in the
 * observations. So the description is recovered rather than stored — the longest value
 * in there that reads as words rather than as a number or a date, which in a bank
 * statement is the merchant line and in anything else is the nearest thing to it.
 */
export function describeRow(observations: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(observations) } catch { return observations.trim() }
  if (!parsed || typeof parsed !== 'object') return observations.trim()

  let best = ''
  for (const [column, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string' || column === 'amount_as_imported') continue
    const text = value.trim()
    if (!text || !/\p{L}{3}/u.test(text)) continue
    if (text.length > best.length) best = text
  }
  return best
}

/** One entry per row, whatever number of screens it was confirmed onto. */
export function dedupeByRow(entries: FilteredEntry[]): FilteredEntry[] {
  const seen = new Set<string>()
  return entries.filter((entry) => (seen.has(entry.rowId) ? false : (seen.add(entry.rowId), true)))
}

export function useDashboardEntries(filters: DashboardFilters, screen?: string): FilteredEntry[] {
  const rows = useConfirmedRowsStore((store) => store.items)
  return useMemo(() => filterConfirmedRows({ rows, filters, screen }), [rows, filters, screen])
}
