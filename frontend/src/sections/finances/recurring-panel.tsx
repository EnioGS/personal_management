import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CategoryPill } from '@/components/dashboard/category-pill'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { StatTile } from '@/components/dashboard/stat-tile'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { useDashboardFilters } from '@/components/dashboard/dashboard-filters'
import { UNLABELLED_LABEL, useDashboardEntries } from '@/components/dashboard/use-dashboard-entries'
import { formatDateLabel, formatMonthLabel, monthKey } from '@/lib/aggregations'
import { declaresRecurrence, detectRecurringEntries } from '@/lib/model/recurring'
import { FinanceTableDrawer } from './finance-table-drawer'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const DAY_MS = 86_400_000

function monthSequence(lastMonth: string): string[] {
  const [year, month] = lastMonth.split('-').map(Number)
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 12 + index, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  })
}

function daysInMonth(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
}

/** Subscriptions and other repeating charges, detected from history rather than declared upfront. */
export function RecurringPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleCategory, clearCategories } = useDashboardFilters()
  const entries = useDashboardEntries(filters)
  // Money that left, as the magnitude that left: a recurring charge is a repeated size.
  const outgoing = useMemo(
    () => entries.filter((entry) => entry.value < 0).map((entry) => ({ ...entry, amount: -entry.value })),
    [entries],
  )
  const candidates = useMemo(() => {
    // A row that calls itself a subscription is one from its first month; everything else
    // has to repeat before this screen will say so. Recurrence is not a label anyone
    // applies any more, so this is where those two readings meet.
    const declared = detectRecurringEntries(outgoing.filter((entry) => declaresRecurrence(entry.category, entry.subcategory, entry.description)), 1)
    const detected = detectRecurringEntries(outgoing)
    const key = (candidate: { category: string; averageAmount: number }) => `${candidate.category}\u0000${Math.round(candidate.averageAmount)}`
    return [...new Map([...declared, ...detected].map((candidate) => [key(candidate), candidate])).values()]
  }, [outgoing])
  const monthlyTotal = candidates.reduce((total, candidate) => total + candidate.averageAmount, 0)
  const largest = candidates.reduce((largestAmount, candidate) => Math.max(largestAmount, candidate.averageAmount), 0)
  const latestMonth = outgoing.length > 0 ? monthKey(Math.max(...outgoing.map((entry) => entry.date))) : new Date().toISOString().slice(0, 7)
  const stripMonths = monthSequence(latestMonth)
  const recurringKeys = useMemo(
    () => new Set(candidates.map((candidate) => `${candidate.category}\u0000${Math.round(candidate.averageAmount)}`)),
    [candidates],
  )
  const currentMonthDays = useMemo(() => {
    const days = new Set<number>()
    for (const entry of outgoing) {
      if (monthKey(entry.date) !== latestMonth) continue
      if (!recurringKeys.has(`${entry.category}\u0000${Math.round(entry.value)}`)) continue
      days.add(new Date(entry.date).getUTCDate())
    }
    return days
  }, [latestMonth, outgoing, recurringKeys])
  const inactive = candidates.filter((candidate) => Date.now() - candidate.lastDate > 60 * DAY_MS)

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        setPreset={setPreset}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
        toggleCategory={toggleCategory}
        clearCategories={clearCategories}
      />
      <div className="min-h-0 flex-1">
        <FinanceTableDrawer id="recurring">
          <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile label={t('finances:recurring.monthlyTotal')} value={currency.format(monthlyTotal)} indicator={DOMAIN_COLOR.balance} />
            <StatTile label={t('finances:recurring.recurringCount')} value={candidates.length.toLocaleString('pt-BR')} indicator={DOMAIN_COLOR.balance} />
            <StatTile label={t('finances:recurring.largestRecurring')} value={currency.format(largest)} indicator={DOMAIN_COLOR.balance} />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard title={t('finances:recurring.recurrences')} className="h-[360px] lg:col-span-2" bodyClassName="overflow-auto p-0">
              {candidates.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:recurring.noneFound')}</p>
              ) : (
                <div className="divide-y">
                  {candidates.map((candidate) => (
                    <div key={`${candidate.category}-${candidate.averageAmount}`} className="grid grid-cols-[minmax(9rem,1fr)_minmax(10rem,1.3fr)_auto] items-center gap-3 p-3">
                      <div className="min-w-0">
                        <CategoryPill label={candidate.category || UNLABELLED_LABEL} />
                        <p className="text-muted-foreground mt-1 text-xs">{t('finances:recurring.lastSeen', { date: formatDateLabel(candidate.lastDate) })}</p>
                      </div>
                      <MonthStrip months={stripMonths} activeMonths={candidate.months} />
                      <span className="shrink-0 text-sm font-medium tabular-nums">{currency.format(candidate.averageAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:recurring.inMonth', { month: formatMonthLabel(latestMonth) })} className="h-[360px]">
              <MonthDayGrid month={latestMonth} activeDays={currentMonthDays} />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <DashboardCard title={t('finances:recurring.notSeenRecently')} className="h-[220px]" bodyClassName="overflow-auto p-0">
              {inactive.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:recurring.noneInactive')}</p>
              ) : (
                <div className="divide-y">
                  {inactive.map((candidate) => (
                    <div key={`${candidate.category}-${candidate.averageAmount}`} className="flex items-center justify-between gap-3 p-3 text-xs">
                      <div className="min-w-0">
                        <CategoryPill label={candidate.category || UNLABELLED_LABEL} />
                        <p className="text-muted-foreground mt-1">{t('finances:recurring.lastSeen', { date: formatDateLabel(candidate.lastDate) })}</p>
                      </div>
                      <span className="shrink-0 tabular-nums">{currency.format(candidate.averageAmount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
            <DashboardCard title={t('finances:recurring.estimatedAnnualCost')} className="h-[220px]">
              <div className="flex h-full flex-col justify-center gap-2">
                <p className="text-3xl font-semibold tabular-nums">{currency.format(monthlyTotal * 12)}</p>
                <p className="text-muted-foreground text-xs">{t('finances:recurring.basedOnMonthly', { value: currency.format(monthlyTotal) })}</p>
              </div>
            </DashboardCard>
          </div>
          </div>
        </FinanceTableDrawer>
      </div>
    </div>
  )
}

function MonthStrip({ months, activeMonths }: { months: string[]; activeMonths: string[] }) {
  const active = new Set(activeMonths)
  return (
    <div className="grid grid-cols-12 gap-1" aria-label="Recurring months">
      {months.map((month) => (
        <span key={month} title={formatMonthLabel(month)} className={`aspect-square rounded-sm ${active.has(month) ? 'bg-primary' : 'bg-muted'}`} />
      ))}
    </div>
  )
}

function MonthDayGrid({ month, activeDays }: { month: string; activeDays: Set<number> }) {
  const [year, monthNumber] = month.split('-').map(Number)
  const leadingBlanks = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay()
  const dayCount = daysInMonth(month)
  return (
    <div className="grid h-full grid-cols-7 content-start gap-1.5 text-center text-xs">
      {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`} className="text-muted-foreground">{day}</span>)}
      {Array.from({ length: leadingBlanks }, (_, index) => <span key={`blank-${index}`} />)}
      {Array.from({ length: dayCount }, (_, index) => index + 1).map((day) => (
        <span key={day} className={`flex aspect-square items-center justify-center rounded-sm ${activeDays.has(day) ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
          {day}
        </span>
      ))}
    </div>
  )
}
