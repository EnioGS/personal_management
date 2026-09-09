import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { AppLineChart } from '@/components/charts/line-chart'
import { CapitalEvolutionChart } from '@/components/charts/capital-evolution-chart'
import { CategoryTreemap } from '@/components/charts/category-treemap'
import { HoldingsPie } from '@/components/charts/holdings-pie'
import { DIVERGING_PAIR, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { SignedBarChart } from '@/components/charts/signed-bar-chart'
import { Button } from '@/components/ui/button'
import { CategoryPill } from '@/components/dashboard/category-pill'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { NestedBarList } from '@/components/dashboard/nested-bar-list'
import { RankedBarList } from '@/components/dashboard/ranked-bar-list'
import { StatTile } from '@/components/dashboard/stat-tile'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { resolveFilterRange, useDashboardFilters, type DashboardFilters } from '@/components/dashboard/dashboard-filters'
import { UNLABELLED_LABEL, useDashboardEntries } from '@/components/dashboard/use-dashboard-entries'
import { formatDateLabel, formatMonthLabel } from '@/lib/aggregations'
import { capitalEvolution } from '@/lib/dashboard/capital-evolution'
import { capitalMetric } from '@/lib/dashboard/capital-metric'
import { monthsThroughToday, spendingMonths, spendingSoFar, trailingAverages } from '@/lib/dashboard/spending-months'
import { declaresRecurrence, detectRecurringEntries } from '@/lib/model/recurring'
import { heldDelta, holdingsSplit } from '@/lib/dashboard/holdings-split'
import {
  accountsWithCards,
  incomeByCategory,
  largestMovements,
  monthlyAverages,
  monthlyFlow,
  monthlySpread,
} from '@/lib/dashboard/movements-analytics'
import { averageSpendByCategory, categoryVsAverage, frequentDescriptions, outgoingSpending, spendingByMonth, type SpendingWindow } from './spending-analytics'
import { FinanceTableDrawer } from './finance-table-drawer'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
/** Changes sit under the number in a quarter of its space: R$ 1,2 mil reads at a glance where the cents do not. */
const compactCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
/** The screens the Movements dashboard reads. Spending rows are copies of movements. */
const MOVEMENTS_SCREEN = 'movements'
const SPENDING_SCREEN = 'spending'
const INVESTMENTS_SCREEN = 'investments'

/** A comparison names the month it compares against, and four months apart the year is never in doubt. */
const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })

/**
 * The Movements dashboard: how the money is doing, in the order it matters.
 *
 * What is held and what a month does with it comes first, above the fold; the shape of it
 * over time next; and the detail — where it sits, what it comes from, what it goes to —
 * below, for whoever scrolls. Everything answers for the period on the bar above.
 */
export function OverviewPanel() {
  const { t } = useTranslation(['finances', 'common', 'investments'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleCategory, clearCategories } = useDashboardFilters()
  const selectedRange = useMemo(() => resolveFilterRange(filters), [filters])

  const movements = useDashboardEntries(filters, MOVEMENTS_SCREEN)
  const spending = useDashboardEntries(filters, SPENDING_SCREEN)

  // Capital must begin at the first row there is, not at the start of the selected
  // window: the points are cut to the window, the running total behind them is not.
  const historyFilters: DashboardFilters = useMemo(
    () => ({ ...filters, preset: 'custom', customFrom: '', customTo: '' }),
    [filters],
  )
  const movementHistory = useDashboardEntries(historyFilters, MOVEMENTS_SCREEN)
  const investmentHistory = useDashboardEntries(historyFilters, INVESTMENTS_SCREEN)

  const capitalData = useMemo(
    () => capitalEvolution({
      movements: movementHistory,
      investments: investmentHistory.map((row) => ({ date: row.date, value: heldDelta(row) })),
    }, selectedRange),
    [movementHistory, investmentHistory, selectedRange],
  )

  const labels = useMemo(
    () => ({
      lastMonth: t('finances:overview.vsLastMonth'),
      sinceMonth: (month: string) => t('finances:overview.vsMonth', { month: shortMonth.format(new Date(`${month}-01`)) }),
    }),
    [t],
  )
  const capital = useMemo(() => capitalMetric(capitalData, 'capital', 'up', labels, compactCurrency.format), [capitalData, labels])
  const investments = useMemo(() => capitalMetric(capitalData, 'investments', 'up', labels, compactCurrency.format), [capitalData, labels])
  const income = useMemo(() => capitalMetric(capitalData, 'income', 'up', labels, compactCurrency.format), [capitalData, labels])
  const spent = useMemo(() => capitalMetric(capitalData, 'spending', 'down', labels, compactCurrency.format), [capitalData, labels])

  const flow = useMemo(() => monthlyFlow(movements), [movements])
  const averages = useMemo(() => monthlyAverages(flow), [flow])
  const spread = useMemo(() => monthlySpread(flow), [flow])
  const accounts = useMemo(() => accountsWithCards(movements, spending), [movements, spending])
  const incomeSources = useMemo(
    () => incomeByCategory(movements, capitalData.map((point) => point.month)),
    [capitalData, movements],
  )
  const biggest = useMemo(() => largestMovements(movements), [movements])
  const holdings = useMemo(() => {
    const named: Record<string, { label: string; color: typeof DOMAIN_COLOR.balance }> = {
      cash: { label: t('finances:overview.cashReserve'), color: DOMAIN_COLOR.balance },
      fixedIncome: { label: t('investments:items.fixedIncome'), color: DOMAIN_COLOR.fixedIncome },
      variableIncome: { label: t('investments:items.variableIncome'), color: DOMAIN_COLOR.variableIncome },
      unclassified: { label: t('finances:overview.unclassifiedHoldings'), color: DOMAIN_COLOR.unclassified },
    }
    return holdingsSplit(investmentHistory).map((group) => ({ ...group, ...named[group.key] }))
  }, [investmentHistory, t])
  const spendingCategories = useMemo(
    () => averageSpendByCategory(spending, capitalData.map((point) => point.month)),
    [capitalData, spending],
  )

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
        <FinanceTableDrawer id="movements">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={t('finances:overview.currentCapital')}
              value={currency.format(capital.current)}
              indicator={DOMAIN_COLOR.balance}
              deltas={capital.deltas}
              sparkline={capital.sparkline}
            />
            <StatTile
              label={t('finances:overview.netCashFlow')}
              value={currency.format(income.current)}
              indicator={DOMAIN_COLOR.cashFlow}
              deltas={income.deltas}
              sparkline={income.sparkline}
            />
            <StatTile
              label={t('common:dashboard.spending')}
              value={currency.format(spent.current)}
              indicator={DIVERGING_PAIR.negative}
              deltas={spent.deltas}
              sparkline={spent.sparkline}
            />
            <StatTile
              label={t('finances:overview.investments')}
              value={currency.format(investments.current)}
              indicator={DOMAIN_COLOR.variableIncome}
              deltas={investments.deltas}
              sparkline={investments.sparkline}
            />
          </div>

          {/* One chart rather than two stacked: what a month moved and what it added up to
              belong on one pair of axes, or the eye has to carry a month between them. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard className="h-[480px] lg:col-span-2" bodyClassName="p-2">
              {capitalData.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:overview.noEntries')}</p>
              ) : (
                <CapitalEvolutionChart
                  data={capitalData}
                  xKey="month"
                  xFormatter={formatMonthLabel}
                  valueFormatter={(value) => currency.format(value)}
                  capitalLabel={t('finances:overview.capitalEvolution')}
                  spendingLabel={t('common:dashboard.spending')}
                  investmentsLabel={t('finances:overview.investments')}
                  netCashFlowLabel={t('finances:overview.netCashFlow')}
                  incomeLabel={t('finances:overview.arrived')}
                />
              )}
            </DashboardCard>

            <div className="flex h-[480px] flex-col gap-3">
              <DashboardCard className="min-h-0 flex-1">
                <RankedBarList
                  items={spendingCategories}
                  valueFormatter={(v) => currency.format(v)}
                  emptyLabel={t('finances:spending.noSpending')}
                  variant="underlined"
                />
              </DashboardCard>

              <DashboardCard className="min-h-0 flex-1" bodyClassName="p-2">
                <HoldingsPie
                  groups={holdings}
                  valueFormatter={(value) => currency.format(value)}
                  emptyLabel={t('finances:overview.noEntries')}
                />
              </DashboardCard>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard title={t('finances:overview.accountsAndCards')} className="h-[320px] lg:col-span-2" bodyClassName="p-3">
              <NestedBarList
                groups={accounts}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:overview.noEntries')}
                childEmptyLabel={t('finances:overview.noCardSpend')}
              />
            </DashboardCard>

            <DashboardCard title={t('finances:overview.incomeSources')} className="h-[320px]">
              <RankedBarList
                items={incomeSources}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:overview.noEntries')}
                variant="underlined"
              />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard title={t('finances:overview.averageMonth')} className="h-[420px]" bodyClassName="p-3">
              <div className="flex h-full flex-col justify-center gap-3">
                <AverageLine label={t('finances:overview.arrived')} value={currency.format(averages.incoming)} />
                <AverageLine label={t('finances:overview.left')} value={currency.format(averages.outgoing)} />
                <AverageLine label={t('finances:overview.netCashFlow')} value={currency.format(averages.net)} strong />
                {/* An average is one month nobody had; these are three that happened. */}
                <div className="mt-1 flex flex-col gap-3 border-t pt-3">
                  <AverageLine label={t('finances:overview.medianMonth')} value={currency.format(spread.median)} />
                  <AverageLine
                    label={t('finances:overview.bestMonth')}
                    value={spread.best ? `${currency.format(spread.best.net)}  ·  ${formatMonthLabel(spread.best.month)}` : '—'}
                  />
                  <AverageLine
                    label={t('finances:overview.worstMonth')}
                    value={spread.worst ? `${currency.format(spread.worst.net)}  ·  ${formatMonthLabel(spread.worst.month)}` : '—'}
                  />
                </div>
              </div>
            </DashboardCard>

            <DashboardCard title={t('finances:overview.largestMovements')} className="h-[420px] lg:col-span-2" bodyClassName="overflow-auto p-0">
              {biggest.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:overview.noEntries')}</p>
              ) : (
                <div className="divide-y">
                  {biggest.map((entry) => (
                    <div key={entry.rowId + entry.date} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="text-muted-foreground w-20 shrink-0 whitespace-nowrap">{formatDateLabel(entry.date)}</span>
                      <span className="min-w-0 flex-1 truncate" title={entry.description}>{entry.description || entry.category || UNLABELLED_LABEL}</span>
                      <CategoryPill label={entry.category || UNLABELLED_LABEL} />
                      <span className={`w-28 shrink-0 text-right tabular-nums ${entry.value > 0 ? 'text-brand' : ''}`}>
                        {entry.value > 0 ? '+' : '-'}{currency.format(Math.abs(entry.value))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>
          </div>
        </div>
        </FinanceTableDrawer>
      </div>
    </div>
  )
}

/** One line of the average-month card: what it is, and how much. */
function AverageLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={`tabular-nums ${strong ? 'text-lg font-semibold' : 'text-sm'}`}>{value}</span>
    </div>
  )
}

/** Outgoing money across the selected period, accounts, cards, and categories. */
export function SpendingPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleCategory, clearCategories } = useDashboardFilters()
  const rows = useDashboardEntries(filters)
  const spending = useMemo(() => outgoingSpending(rows), [rows])
  const monthlySpending = useMemo(() => spendingByMonth(spending), [spending])

  // What repeats is what a month could not have avoided, and the rest is what it chose.
  const recurringKeys = useMemo(() => {
    const detected = detectRecurringEntries(spending.map((row) => ({ ...row, amount: -row.value })))
    return new Set(detected.map((entry) => `${entry.category}\u0000${Math.round(entry.averageAmount)}`))
  }, [spending])
  const isCommitted = useCallback(
    (row: (typeof spending)[number]) =>
      declaresRecurrence(row.description) || recurringKeys.has(`${row.category}\u0000${Math.round(-row.value)}`),
    [recurringKeys],
  )
  // Through to the calendar month it actually is: the month in progress is the month,
  // not the last one the data reaches.
  const months = useMemo(() => monthsThroughToday(spendingMonths(spending, isCommitted)), [spending, isCommitted])
  const soFar = useMemo(() => spendingSoFar(spending), [spending])

  const labels = useMemo(
    () => ({
      lastMonth: t('finances:overview.vsLastMonth'),
      sinceMonth: (month: string) => t('finances:overview.vsMonth', { month: shortMonth.format(new Date(`${month}-01`)) }),
    }),
    [t],
  )
  const spent = useMemo(() => capitalMetric(months, 'spent', 'down', labels, compactCurrency.format), [months, labels])
  const committed = useMemo(() => capitalMetric(months, 'committed', 'down', labels, compactCurrency.format), [months, labels])

  const categorySpending = useMemo(
    () => averageSpendByCategory(spending, months.map((month) => month.month)),
    [months, spending],
  )
  const [monthsBack, setMonthsBack] = useState<SpendingWindow>(3)
  const monthChanges = useMemo(() => categoryVsAverage(spending, monthsBack), [spending, monthsBack])
  const descriptions = useMemo(() => frequentDescriptions(spending), [spending])

  const totalSpent = spending.reduce((total, row) => total - row.value, 0)
  const monthlyAverage = months.length > 0 ? totalSpent / months.length : 0
  const perMonth = (value: number) => (months.length > 0 ? value / months.length : 0)
  /**
   * The month in progress, run to its end at the rate it has managed so far.
   *
   * Only meaningful once a month has a few days in it: on the second, one large purchase
   * projects to a catastrophe. Below three days it says nothing rather than something
   * alarming and wrong.
   */
  const projected = useMemo(() => {
    const today = new Date()
    const dayOfMonth = today.getDate()
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
    const current = months.at(-1)
    if (!current || dayOfMonth < 3) return null
    const lastMonth = months.at(-2)?.spent ?? 0
    const monthEnd = (current.spent / dayOfMonth) * daysInMonth
    return {
      monthEnd,
      lastMonth,
      dayOfMonth,
      daysInMonth,
      // A fraction, which is what StatTile renders as a percentage.
      comparison: lastMonth > 0 ? (monthEnd - lastMonth) / lastMonth : null,
    }
  }, [months])
  const byCount = [...descriptions].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 5)
  const byTotal = [...descriptions].sort((a, b) => b.total - a.total || b.count - a.count).slice(0, 5)

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
        <FinanceTableDrawer id="spending">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={t('finances:spending.currentMonth')}
              value={currency.format(spent.current)}
              indicator={DIVERGING_PAIR.negative}
              deltas={spent.deltas}
              sparkline={spent.sparkline}
            />
            <StatTile
              label={t('finances:spending.monthlyAverage')}
              value={currency.format(monthlyAverage)}
              indicator={DOMAIN_COLOR.spending}
              // Four points, each the average of its own month and the three before it:
              // where the level is going, rather than what the last month happened to be.
              sparkline={trailingAverages(months)}
            />
            <StatTile
              label={t('finances:spending.committed')}
              value={currency.format(committed.current)}
              indicator={DOMAIN_COLOR.cards}
              deltas={committed.deltas}
              sparkline={committed.sparkline}
            />
            {/* Where the month ends up if the rest of it looks like the part that has
                happened — the one thing a month in progress can say that a finished month
                cannot, and the question the incomplete first tile raises. */}
            <StatTile
              label={t('finances:spending.projected')}
              value={projected === null ? '\u2014' : currency.format(projected.monthEnd)}
              indicator={DIVERGING_PAIR.negative}
              deltas={projected ? [
                ...(projected.comparison !== null ? [{
                  change: compactCurrency.format(Math.abs(projected.monthEnd - projected.lastMonth)),
                  percent: projected.comparison,
                  direction: (projected.comparison > 0 ? 'up' : projected.comparison < 0 ? 'down' : 'flat') as 'up' | 'down' | 'flat',
                  goodDirection: 'down' as const,
                  label: t('finances:overview.vsLastMonth'),
                }] : []),
                // What the projection is standing on, said plainly: a rate read off eight
                // days is not the same claim as one read off twenty-five.
                {
                  change: t('finances:spending.dayOfMonth', { day: projected.dayOfMonth, days: projected.daysInMonth }),
                  direction: 'flat' as const,
                  goodDirection: 'down' as const,
                  label: t('finances:spending.atThisRate'),
                },
              ] : undefined}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard
              title={t('finances:spending.byMonth')}
              className="h-[320px] lg:col-span-2"
              bodyClassName="p-2"
              footnote={months.length > 0 ? t('finances:spending.averageReference', { value: currency.format(monthlyAverage) }) : undefined}
            >
              {monthlySpending.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:spending.noSpending')}</p>
              ) : (
                <AppBarChart
                  data={monthlySpending}
                  xKey="month"
                  series={{ key: 'amount', label: t('common:dashboard.spending'), color: DOMAIN_COLOR.spending }}
                  xFormatter={formatMonthLabel}
                  referenceValue={monthlyAverage}
                  valueFormatter={(value) => currency.format(value)}
                />
              )}
            </DashboardCard>

            {/* Size is how much, colour is which way it is going: the two questions about a
                category a person already knows the name of. */}
            <DashboardCard title={t('finances:spending.byCategory')} className="h-[320px]" bodyClassName="p-0">
              <CategoryTreemap
                items={categorySpending}
                colourBy="drift"
                valueFormatter={(value) => currency.format(value)}
                emptyLabel={t('finances:spending.noSpending')}
              />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {/* The only chart here that answers "am I over, right now": the fifteenth
                against the fifteenth, rather than against a month that had thirty days. */}
            <DashboardCard title={t('finances:spending.soFar')} className="h-[280px]" bodyClassName="p-2">
              {soFar.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:spending.noSpending')}</p>
              ) : (
                <AppLineChart
                  data={soFar}
                  xKey="day"
                  xFormatter={(day: string | number) => String(day)}
                  // Daily line, weekly labels: thirty-one numbers along an axis this wide
                  // overlap into a grey band.
                  xTicks={[1, 8, 15, 22, 29]}
                  valueFormatter={(value) => currency.format(value)}
                  series={[
                    // The month in progress is the subject; the one before it is the ruler,
                    // so it is drawn in something quieter than another shade of the same red.
                    { key: 'thisMonth', label: t('finances:spending.thisMonth'), color: DIVERGING_PAIR.negative },
                    { key: 'lastMonth', label: t('finances:spending.lastMonth'), color: DOMAIN_COLOR.cards },
                  ]}
                />
              )}
            </DashboardCard>

            <DashboardCard
              title={t('finances:spending.vsAverage', { count: monthsBack })}
              className="h-[280px]"
              bodyClassName="p-2"
              action={
                <span className="flex gap-0.5">
                  {([1, 3, 6] as const).map((option) => (
                    <Button
                      key={option}
                      type="button"
                      size="xs"
                      variant={monthsBack === option ? 'secondary' : 'ghost'}
                      onClick={() => setMonthsBack(option)}
                    >
                      {t('finances:spending.monthsBack', { count: option })}
                    </Button>
                  ))}
                </span>
              }
            >
              {monthChanges.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:spending.noCategoryChanges')}</p>
              ) : (
                <SignedBarChart
                  data={monthChanges}
                  xKey="category"
                  valueKey="change"
                  upLabel={t('finances:spending.moreSpent')}
                  downLabel={t('finances:spending.lessSpent')}
                  upColor={DIVERGING_PAIR.negative}
                  downColor={DOMAIN_COLOR.balance}
                  valueFormatter={(value) => currency.format(value)}
                />
              )}
            </DashboardCard>
          </div>

          {/* Per month, not per window: "eleven times a month" is a habit, "two hundred
              and sixty-four times" is a number nobody can act on. */}
          <DashboardCard title={t('finances:spending.frequentDescriptions')} className="h-[280px]" bodyClassName="p-0">
            {descriptions.length === 0 ? (
              <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:spending.noDescriptions')}</p>
            ) : (
              <div className="grid h-full grid-cols-2 divide-x">
                <DescriptionRankList
                  title={t('finances:spending.byCount')}
                  rows={byCount}
                  valueFormatter={(row) => t('finances:spending.timesPerMonth', { count: Math.max(1, Math.round(perMonth(row.count))) })}
                />
                <DescriptionRankList
                  title={t('finances:spending.byTotal')}
                  rows={byTotal}
                  valueFormatter={(row) => `${currency.format(perMonth(row.total))} / ${t('finances:spending.month')}`}
                />
              </div>
            )}
          </DashboardCard>
        </div>

        </FinanceTableDrawer>
      </div>
    </div>
  )
}

function DescriptionRankList({
  title,
  rows,
  valueFormatter,
}: {
  title: string
  rows: { label: string; count: number; total: number }[]
  valueFormatter: (row: { label: string; count: number; total: number }) => string
}) {
  return (
    <div className="flex min-h-0 flex-col">
      <p className="text-muted-foreground shrink-0 border-b px-3 py-2 text-[10px] font-medium tracking-wide uppercase">{title}</p>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs last:border-0">
            <span className="min-w-0 truncate" title={row.label}>{row.label}</span>
            <span className="shrink-0 tabular-nums">{valueFormatter(row)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
