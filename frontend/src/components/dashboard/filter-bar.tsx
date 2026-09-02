import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useAccountsStore, useCardsStore, useCategoriesStore } from '@/lib/model/model-stores'
import type { DateRangePreset } from '@/lib/dashboard/date-range'
import type { DashboardFilters } from './dashboard-filters'

const PRESETS: DateRangePreset[] = ['last30', 'last90', 'thisYear', 'custom']

interface FilterBarProps {
  filters: DashboardFilters
  setPreset: (preset: DateRangePreset) => void
  setCustomFrom: (value: string) => void
  setCustomTo: (value: string) => void
  toggleAccount: (id: number) => void
  toggleCard: (id: number) => void
  toggleCategory: (name: string) => void
  /** Which pill rows this dashboard needs — Investments has no accounts/cards to filter by. */
  show?: { accounts?: boolean; cards?: boolean; categories?: boolean }
}

/**
 * One row, above every chart it scopes — the dataviz skill's filter composition rule.
 * Date range leads (it's the filter every reader reaches for first); dimension filters
 * follow as toggle pills, since there are usually few enough accounts/cards/categories
 * for pills to beat a dropdown on directness.
 */
export function FilterBar({
  filters,
  setPreset,
  setCustomFrom,
  setCustomTo,
  toggleAccount,
  toggleCard,
  toggleCategory,
  show = { accounts: true, cards: true, categories: true },
}: FilterBarProps) {
  const { t } = useTranslation('common')
  const accounts = useAccountsStore((s) => s.items).filter((a) => !a.archived)
  const cards = useCardsStore((s) => s.items).filter((c) => !c.archived)
  const categories = useCategoriesStore((s) => s.items)

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
        <PillGroup
          label={t('dashboard.accounts')}
          items={accounts}
          selected={filters.accountIds}
          onToggle={toggleAccount}
        />
      )}

      {show.cards && cards.length > 0 && (
        <PillGroup label={t('dashboard.cards')} items={cards} selected={filters.cardIds} onToggle={toggleCard} />
      )}

      {show.categories && categories.length > 0 && (
        <PillGroup
          label={t('dashboard.categories')}
          items={categories.map((c) => ({ id: c.name, name: c.name }))}
          selected={filters.categories}
          onToggle={toggleCategory}
        />
      )}
    </div>
  )
}

function PillGroup<Id extends string | number>({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string
  items: { id: Id; name: string }[]
  selected: Id[]
  onToggle: (id: Id) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-muted-foreground text-xs">{label}:</span>
      <div className="flex flex-wrap gap-1">
        {items.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant={selected.includes(item.id) ? 'secondary' : 'outline'}
            size="xs"
            aria-pressed={selected.includes(item.id)}
            onClick={() => onToggle(item.id)}
          >
            {item.name}
          </Button>
        ))}
      </div>
    </div>
  )
}
