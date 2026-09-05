import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { CapitalEvolutionChart } from '@/components/charts/capital-evolution-chart'
import { DIVERGING_PAIR, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { DivergingBarChart } from '@/components/charts/diverging-bar-chart'
import { CategoryPill } from '@/components/dashboard/category-pill'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { NestedBarList } from '@/components/dashboard/nested-bar-list'
import { RankedBarList } from '@/components/dashboard/ranked-bar-list'
import { StatTile, type StatDelta } from '@/components/dashboard/stat-tile'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { resolveFilterRange, useDashboardFilters, type DashboardFilters } from '@/components/dashboard/dashboard-filters'
import { UNLABELLED_LABEL, useDashboardEntries } from '@/components/dashboard/use-dashboard-entries'
import { formatDateLabel, formatMonthLabel, groupByKey } from '@/lib/aggregations'
import { capitalEvolution } from '@/lib/dashboard/capital-evolution'
import { capitalMetric } from '@/lib/dashboard/capital-metric'
import {
  accountsWithCards,
  incomeByCategory,
  largestMovements,
  monthlyAverages,
  monthlyFlow,
  monthlySpread,
  monthsOfRunway,
  savingsRate,
  savingsRateByMonth,
} from '@/lib/dashboard/movements-analytics'
import { averageSpendByCategory, categorySpendChanges, frequentDescriptions, outgoingSpending, spendingByMonth } from './spending-analytics'
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
    () => capitalEvolution({ movements: movementHistory, investments: investmentHistory }, selectedRange),
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
  const saved = useMemo(() => savingsRate(movements), [movements])
  const savedByMonth = useMemo(() => savingsRateByMonth(flow), [flow])
  const spread = useMemo(() => monthlySpread(flow), [flow])
  const runway = useMemo(
    () => monthsOfRunway(capital.current, capitalData.map((point) => point.spending)),
    [capital, capitalData],
  )
  const accounts = useMemo(() => accountsWithCards(movements, spending), [movements, spending])
  const incomeSources = useMemo(() => incomeByCategory(movements), [movements])
  const biggest = useMemo(() => largestMovements(movements), [movements])
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
              indicatorColor={DOMAIN_COLOR.balance.light}
              deltas={capital.deltas}
              sparkline={capital.sparkline}
            />
            <StatTile
              label={t('finances:overview.netMonthlyIncome')}
              value={currency.format(income.current)}
              indicatorColor={DOMAIN_COLOR.contributions.light}
              deltas={income.deltas}
              sparkline={income.sparkline}
            />
            <StatTile
              label={t('common:dashboard.spending')}
              value={currency.format(spent.current)}
              indicatorColor={DIVERGING_PAIR.negative.light}
              deltas={spent.deltas}
              sparkline={spent.sparkline}
            />
            <StatTile
              label={t('finances:overview.investments')}
              value={currency.format(investments.current)}
              indicatorColor={DOMAIN_COLOR.variableIncome.light}
              deltas={investments.deltas}
              sparkline={investments.sparkline}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <DashboardCard
              title={t('finances:overview.capitalEvolution')}
              className="col-span-2 h-[320px]"
              bodyClassName="p-2"
            >
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
                />
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:overview.spendingCategories')} className="h-[320px]">
              <RankedBarList
                items={spendingCategories}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:spending.noSpending')}
                variant="underlined"
              />
            </DashboardCard>
          </div>

          {/* Below the fold: the same period, read three ways — what the months look
              like, where the money sits, and which rows account for most of it. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard title={t('finances:overview.cashFlow')} className="h-[300px] lg:col-span-2" bodyClassName="p-2">
              {flow.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:overview.noEntries')}</p>
              ) : (
                <DivergingBarChart
                  data={flow}
                  xKey="month"
                  positiveKey="incoming"
                  negativeKey="outgoing"
                  positiveLabel={t('finances:overview.arrived')}
                  negativeLabel={t('finances:overview.left')}
                  netKey="net"
                  netLabel={t('finances:overview.netCashFlow')}
                  positiveColor={DOMAIN_COLOR.balance}
                  negativeColor={DIVERGING_PAIR.negative}
                  netColor={DOMAIN_COLOR.contributions}
                  xFormatter={formatMonthLabel}
                  valueFormatter={(value) => currency.format(value)}
                />
              )}
            </DashboardCard>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatTile
                label={t('finances:overview.savingsRate')}
                value={saved === null ? '—' : formatRate(saved)}
                indicatorColor={DOMAIN_COLOR.contributions.light}
                footnote={savedByMonth.length > 0 ? t('finances:overview.savingsRateMonths', { count: savedByMonth.length }) : undefined}
                deltas={savingsDelta(saved, savedByMonth, t('finances:overview.vsYourAverage'))}
                sparkline={savedByMonth.map((month) => month.rate)}
              />
              <StatTile
                label={t('finances:overview.runway')}
                value={runway === null ? '—' : t('finances:overview.runwayMonths', { count: Math.round(runway.months) })}
                indicatorColor={DOMAIN_COLOR.balance.light}
                tone={runway === null ? 'default' : runway.months >= COMFORTABLE_RUNWAY ? 'positive' : runway.months < THIN_RUNWAY ? 'negative' : 'default'}
                footnote={
                  runway === null
                    ? undefined
                    : t('finances:overview.runwayFormula', {
                        capital: currency.format(Math.max(0, runway.capital)),
                        spending: currency.format(runway.monthlySpending),
                      })
                }
              />
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

/** Six months of outflow covered is the usual advice; under three is the usual warning. */
const COMFORTABLE_RUNWAY = 6
const THIN_RUNWAY = 3

const formatRate = (rate: number) => `${Math.round(rate * 100)}%`

/**
 * How the last month kept up with the period's own rate.
 *
 * A rate against a rate is a difference in percentage points, not a percentage of a
 * percentage — 30% against 20% is ten points better, and calling it "50% more" would be
 * arithmetic nobody asked for.
 */
function savingsDelta(overall: number | null, months: { rate: number }[], label: string): StatDelta[] {
  const last = months.at(-1)
  if (overall === null || !last || months.length < 2) return []
  const points = Math.round((last.rate - overall) * 100)
  return [{
    change: `${Math.abs(points)} p.p.`,
    direction: points === 0 ? 'flat' : points > 0 ? 'up' : 'down',
    goodDirection: 'up',
    label,
  }]
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
  const categorySpending = useMemo(
    () => groupByKey(spending.map((row) => ({ ...row, amount: -row.value })), 'category', 'amount')
      .map((group) => ({ key: group.label, label: group.label, value: group.value })),
    [spending],
  )
  const monthChanges = useMemo(() => categorySpendChanges(spending), [spending])
  const descriptions = useMemo(() => frequentDescriptions(spending), [spending])

  // Spending rows are negative, being money that left; every figure here reports the
  // magnitude that left, so each one negates.
  const totalSpent = spending.reduce((total, row) => total - row.value, 0)
  const monthlyAverage = monthlySpending.length > 0 ? totalSpent / monthlySpending.length : 0
  const largestExpense = spending.reduce((largest, row) => Math.max(largest, -row.value), 0)
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
              label={t('finances:spending.totalSpent')}
              value={currency.format(totalSpent)}
              indicatorColor={DOMAIN_COLOR.spending.light}
              sparkline={monthlySpending.map((month) => month.amount)}
            />
            <StatTile
              label={t('finances:spending.monthlyAverage')}
              value={currency.format(monthlyAverage)}
              indicatorColor={DOMAIN_COLOR.spending.light}
            />
            <StatTile
              label={t('finances:spending.largestExpense')}
              value={currency.format(largestExpense)}
              indicatorColor={DOMAIN_COLOR.spending.light}
            />
            <StatTile
              label={t('finances:spending.entryCount')}
              value={spending.length.toLocaleString('pt-BR')}
              indicatorColor={DOMAIN_COLOR.spending.light}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard
              title={t('finances:spending.byMonth')}
              className="h-[320px] lg:col-span-2"
              bodyClassName="p-2"
              footnote={
                monthlySpending.length > 0
                  ? t('finances:spending.averageReference', { value: currency.format(monthlyAverage) })
                  : undefined
              }
            >
              {monthlySpending.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:spending.noSpending')}</p>
              ) : (
                <AppBarChart
                  data={monthlySpending}
                  xKey="month"
                  series={{ key: 'amount', label: t('finances:spending.totalSpent'), color: DOMAIN_COLOR.spending }}
                  xFormatter={formatMonthLabel}
                  referenceValue={monthlyAverage}
                  valueFormatter={(value) => currency.format(value)}
                />
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:spending.byCategory')} className="h-[320px]">
              <RankedBarList
                items={categorySpending}
                valueFormatter={(value) => currency.format(value)}
                emptyLabel={t('finances:spending.noSpending')}
              />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <DashboardCard title={t('finances:spending.currentVsPrevious')} className="h-[280px]" bodyClassName="p-2">
              {monthChanges.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:spending.noCategoryChanges')}</p>
              ) : (
                <DivergingBarChart
                  data={monthChanges}
                  xKey="category"
                  positiveKey="increased"
                  negativeKey="decreased"
                  positiveLabel={t('finances:spending.moreSpent')}
                  negativeLabel={t('finances:spending.lessSpent')}
                  positiveColor={DIVERGING_PAIR.negative}
                  negativeColor={DOMAIN_COLOR.balance}
                  valueFormatter={(value) => currency.format(value)}
                />
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:spending.frequentDescriptions')} className="h-[280px]" bodyClassName="p-0">
              {descriptions.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:spending.noDescriptions')}</p>
              ) : (
                <div className="grid h-full grid-cols-2 divide-x">
                  <DescriptionRankList
                    title={t('finances:spending.byCount')}
                    rows={byCount}
                    valueFormatter={(row) => t('finances:spending.occurrences', { count: row.count })}
                  />
                  <DescriptionRankList
                    title={t('finances:spending.byTotal')}
                    rows={byTotal}
                    valueFormatter={(row) => currency.format(row.total)}
                  />
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
