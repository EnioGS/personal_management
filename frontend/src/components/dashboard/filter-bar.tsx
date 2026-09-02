import { useTranslation } from 'react-i18next'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAccountsStore, useCardsStore, useCategoriesStore, useTableDefsStore } from '@/lib/model/model-stores'
import type { DateRangePreset } from '@/lib/dashboard/date-range'
import type { TableKind } from '@/lib/model/types'
import type { DashboardFilters } from './dashboard-filters'

const PRESETS: DateRangePreset[] = ['thisYear', 'last12Months', 'last24Months', 'custom']

interface FilterBarProps {
  filters: DashboardFilters
  setPreset: (preset: DateRangePreset) => void
  setCustomFrom: (value: string) => void
  setCustomTo: (value: string) => void
  selectAccount: (id: number | null) => void
  selectTable: (id: number | null) => void
  selectCard: (id: number | null) => void
  toggleCategory: (name: string) => void
  clearCategories: () => void
  /** Which context dimensions this dashboard needs — only relevant filters earn a place in the bar. */
  show?: { accounts?: boolean; tables?: boolean; cards?: boolean; categories?: boolean }
  /** Restricts the optional table dropdown to the ledger kinds meaningful on this screen. */
  tableKinds?: TableKind[]
}

/**
 * One row, above every chart it scopes — the dataviz skill's filter composition rule.
 * Date range leads (it's the filter every reader reaches for first); dimension filters
 * follow as compact dropdowns for accounts/cards and categories.
 */
export function FilterBar({
  filters,
  setPreset,
  setCustomFrom,
  setCustomTo,
  selectAccount,
  selectTable,
  selectCard,
  toggleCategory,
  clearCategories,
  show = { accounts: true, cards: true, categories: true },
  tableKinds,
}: FilterBarProps) {
  const { t } = useTranslation('common')
  const accounts = useAccountsStore((s) => s.items).filter((a) => !a.archived)
  const cards = useCardsStore((s) => s.items).filter((c) => !c.archived)
  const categories = useCategoriesStore((s) => s.items).filter((category) => !category.archived)
  const tables = useTableDefsStore((s) => s.items).filter((table) => !tableKinds || tableKinds.includes(table.kind))

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b p-2">
      <div className="inline-flex rounded-md border p-0.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset}
            type="button"
            variant={filters.preset === preset ? 'secondary' : 'ghost'}
            size="xs"
            aria-pressed={filters.preset === preset}
            onClick={() => setPreset(preset)}
          >
            {t(`dashboard.presets.${preset}` as never)}
          </Button>
        ))}
      </div>

      {filters.preset === 'custom' && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={filters.customFrom}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="border-input h-7 rounded-sm border bg-transparent px-1.5 text-xs"
          />
          <span className="text-muted-foreground text-xs">{t('dashboard.rangeTo')}</span>
          <input
            type="date"
            value={filters.customTo}
            onChange={(e) => setCustomTo(e.target.value)}
            className="border-input h-7 rounded-sm border bg-transparent px-1.5 text-xs"
          />
        </div>
      )}

      {show.accounts && accounts.length > 0 && (
        <FilterSelect
          label={t('dashboard.accounts')}
          items={accounts}
          selected={filters.accountIds[0]}
          allLabel={t('dashboard.allAccounts')}
          onSelect={selectAccount}
        />
      )}

      {show.tables && tables.length > 0 && (
        <FilterSelect
          label={t('dashboard.tables')}
          items={tables}
          selected={filters.tableIds[0]}
          allLabel={t('dashboard.allTables')}
          onSelect={selectTable}
        />
      )}

      {show.cards && cards.length > 0 && (
        <FilterSelect
          label={t('dashboard.cards')}
          items={cards}
          selected={filters.cardIds[0]}
          allLabel={t('dashboard.allCards')}
          onSelect={selectCard}
        />
      )}

      {show.categories && categories.length > 0 && (
        <CategoryFilter
          label={t('dashboard.categories')}
          items={categories.map((c) => ({ id: c.name, name: c.name }))}
          selected={filters.categories}
          allLabel={t('dashboard.allCategories')}
          selectedLabel={t('dashboard.selectedCategories', { count: filters.categories.length })}
          onToggle={toggleCategory}
          onClear={clearCategories}
        />
      )}
    </div>
  )
}

function CategoryFilter({
  label,
  items,
  selected,
  allLabel,
  selectedLabel,
  onToggle,
  onClear,
}: {
  label: string
  items: { id: string; name: string }[]
  selected: string[]
  allLabel: string
  selectedLabel: string
  onToggle: (name: string) => void
  onClear: () => void
}) {
  const selectedNames = items.filter((item) => selected.includes(item.id)).map((item) => item.name)
  const triggerLabel = selectedNames.length === 0 ? allLabel : selectedNames.length === 1 ? selectedNames[0] : selectedLabel

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="xs" className="min-w-32 justify-between font-normal">
            <span className="max-w-44 truncate">{triggerLabel}</span>
            <ChevronDown aria-hidden="true" className="text-muted-foreground ml-2 size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem className="text-xs" onSelect={onClear}>{allLabel}</DropdownMenuItem>
          <DropdownMenuSeparator />
          {items.map((item) => (
            <DropdownMenuCheckboxItem
              key={item.id}
              className="text-xs"
              checked={selected.includes(item.id)}
              onCheckedChange={() => onToggle(item.id)}
            >
              {item.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function FilterSelect({
  label,
  items,
  selected,
  allLabel,
  onSelect,
}: {
  label: string
  items: { id: number; name: string }[]
  selected?: number
  allLabel: string
  onSelect: (id: number | null) => void
}) {
  const selectedItem = items.find((item) => item.id === selected)
  const triggerLabel = selectedItem?.name ?? allLabel

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}:</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="xs" className="min-w-32 justify-between font-normal">
            <span className="max-w-44 truncate">{triggerLabel}</span>
            <ChevronDown aria-hidden="true" className="text-muted-foreground ml-2 size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem className="text-xs" onSelect={() => onSelect(null)}>{allLabel}</DropdownMenuItem>
          <DropdownMenuSeparator />
          {items.map((item) => (
            <DropdownMenuCheckboxItem
              key={item.id}
              className="text-xs"
              checked={selected === item.id}
              onCheckedChange={() => onSelect(item.id)}
            >
              {item.name}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
