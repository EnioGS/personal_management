import { useState } from 'react'
import { resolvePreset, type DateRange, type DateRangePreset } from '@/lib/dashboard/date-range'

export interface DashboardFilters {
  preset: DateRangePreset
  /** yyyy-mm-dd, bound directly to the custom-range date inputs. */
  customFrom: string
  customTo: string
  /** Empty means "every account" — an empty filter is not the same as "match nothing". */
  accountIds: number[]
  cardIds: number[]
  categories: string[]
}

// Seeds the custom-range inputs with the default preset's own bounds, so switching to
// "custom" starts from where the user already was instead of an unrelated window.
function defaultCustomBounds(): { from: string; to: string } {
  const range = resolvePreset('last90')
  return { from: new Date(range.from).toISOString().slice(0, 10), to: new Date(range.to).toISOString().slice(0, 10) }
}

export function useDashboardFilters() {
  const [filters, setFilters] = useState<DashboardFilters>(() => {
    const { from, to } = defaultCustomBounds()
    return { preset: 'last90', customFrom: from, customTo: to, accountIds: [], cardIds: [], categories: [] }
  })

  function toggle(list: number[], id: number): number[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
  }

  return {
    filters,
    setPreset: (preset: DateRangePreset) => setFilters((f) => ({ ...f, preset })),
    setCustomFrom: (customFrom: string) => setFilters((f) => ({ ...f, customFrom, preset: 'custom' })),
    setCustomTo: (customTo: string) => setFilters((f) => ({ ...f, customTo, preset: 'custom' })),
    toggleAccount: (id: number) => setFilters((f) => ({ ...f, accountIds: toggle(f.accountIds, id) })),
    toggleCard: (id: number) => setFilters((f) => ({ ...f, cardIds: toggle(f.cardIds, id) })),
    toggleCategory: (name: string) =>
      setFilters((f) => ({
        ...f,
        categories: f.categories.includes(name) ? f.categories.filter((c) => c !== name) : [...f.categories, name],
      })),
  }
}

/** The filters' date range as concrete bounds, resolving `custom` against its two inputs. */
export function resolveFilterRange(filters: DashboardFilters): DateRange {
  if (filters.preset !== 'custom') return resolvePreset(filters.preset)
  const from = Date.parse(filters.customFrom)
  const to = Date.parse(filters.customTo) + 86_400_000 - 1 // inclusive end of that day
  return { from: Number.isNaN(from) ? -Infinity : from, to: Number.isNaN(to) ? Infinity : to }
}
