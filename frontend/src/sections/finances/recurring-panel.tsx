import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { useDashboardFilters } from '@/components/dashboard/dashboard-filters'
import { useDashboardEntries } from '@/components/dashboard/use-dashboard-entries'
import { detectRecurringEntries } from '@/lib/model/recurring'
import { formatDateLabel } from '@/lib/aggregations'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Subscriptions and other repeating charges, detected from history rather than declared upfront. */
export function RecurringPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleAccount, toggleCard, toggleCategory } =
    useDashboardFilters()
  const entries = useDashboardEntries(filters)

  const candidates = useMemo(() => {
    const outgoing = entries.filter((e) => e.direction === 'out')
    return detectRecurringEntries(outgoing)
  }, [entries])

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        setPreset={setPreset}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
        toggleAccount={toggleAccount}
        toggleCard={toggleCard}
        toggleCategory={toggleCategory}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <p className="text-muted-foreground mb-3 text-xs">{t('finances:recurring.description')}</p>
        {candidates.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
            {t('finances:recurring.noneFound')}
          </p>
        ) : (
          <div className="flex flex-col divide-y rounded-md border">
            {candidates.map((c) => (
              <div key={`${c.category}-${c.averageAmount}`} className="flex items-center justify-between gap-2 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.category}</p>
                  <p className="text-muted-foreground text-xs">
                    {t('finances:recurring.monthCount', { count: c.months.length })} ·{' '}
                    {t('finances:recurring.lastSeen', { date: formatDateLabel(c.lastDate) })}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-medium tabular-nums">{currency.format(c.averageAmount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
