import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useConfirmedRowsStore } from '@/lib/model/model-stores'
import type { DateRangePreset } from '@/lib/dashboard/date-range'
import type { DashboardFilters } from './dashboard-filters'

const PRESETS: DateRangePreset[] = ['thisYear', 'last12Months', 'last24Months', 'custom']

interface FilterBarProps {
  filters: DashboardFilters
  setPreset: (preset: DateRangePreset) => void
  setCustomFrom: (value: string) => void
  setCustomTo: (value: string) => void
  toggleCategory: (name: string) => void
  clearCategories: () => void
  /** Which context dimensions this dashboard needs — only relevant filters earn a place in the bar. */
  show?: { categories?: boolean }
}

/**
 * The context row above a dashboard: a date range, and the categories to keep.
 *
 * Accounts, cards and tables used to be here too. They were properties of a table model
 * the app no longer has — a row's placement is now a label, and its category is the only
 * dimension it carries independently of where it was placed.
 */
export function FilterBar({
  filters,
  setPreset,
  setCustomFrom,
  setCustomTo,
  toggleCategory,
  clearCategories,
  show = { categories: true },
}: FilterBarProps) {
  const { t } = useTranslation(['common'])
  // The selector returns the stored array itself and the list is derived here: a
  // selector that builds a new array every call is never equal to the last one, and the
  // subscription re-renders forever.
  const rows = useConfirmedRowsStore((store) => store.items)
  const categories = useMemo(() => [...new Set(rows.map((row) => row.category))].sort(), [rows])

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b p-2">
      {PRESETS.map((preset) => (
        <Button
          key={preset}
          type="button"
          size="xs"
          variant={filters.preset === preset ? 'secondary' : 'ghost'}
          onClick={() => setPreset(preset)}
        >
          {t(`common:dashboard.${preset}` as never)}
        </Button>
      ))}

      {filters.preset === 'custom' && (
        <span className="flex items-center gap-1">
          <input type="date" value={filters.customFrom} onChange={(event) => setCustomFrom(event.target.value)} className="bg-background h-7 rounded-md border px-1.5 text-xs" />
          <input type="date" value={filters.customTo} onChange={(event) => setCustomTo(event.target.value)} className="bg-background h-7 rounded-md border px-1.5 text-xs" />
        </span>
      )}

      {show.categories && categories.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="xs" variant={filters.categories.length > 0 ? 'secondary' : 'outline'} className="gap-1">
              {filters.categories.length > 0 ? t('common:dashboard.selectedCategories', { count: filters.categories.length }) : t('common:dashboard.categories')}
              <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-auto text-xs">
            {categories.map((category) => (
              <DropdownMenuCheckboxItem key={category} checked={filters.categories.includes(category)} onCheckedChange={() => toggleCategory(category)}>
                {category}
              </DropdownMenuCheckboxItem>
            ))}
            {filters.categories.length > 0 && (
              <DropdownMenuItem onClick={clearCategories}>{String(t('common:dashboard.clear' as never))}</DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

