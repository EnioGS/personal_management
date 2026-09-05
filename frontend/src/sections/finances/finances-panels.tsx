import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { CapitalEvolutionChart } from '@/components/charts/capital-evolution-chart'
import { DIVERGING_PAIR, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { DivergingBarChart } from '@/components/charts/diverging-bar-chart'
import { CategoryPill } from '@/components/dashboard/category-pill'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { RankedBarList } from '@/components/dashboard/ranked-bar-list'
import { StatTile, type StatDelta } from '@/components/dashboard/stat-tile'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { resolveFilterRange, useDashboardFilters, type DashboardFilters } from '@/components/dashboard/dashboard-filters'
import { useDashboardEntries } from '@/components/dashboard/use-dashboard-entries'
import { formatDateLabel, formatMonthLabel, groupByKey } from '@/lib/aggregations'
import { capitalEvolution, type CapitalEvolutionPoint, type InvestmentValueEntry } from '@/lib/dashboard/capital-evolution'
import { asTransaction, isFixedIncome, useInvestmentRows } from '@/lib/model/investment-rows'
import { averageSpendByCategory, categorySpendChanges, frequentDescriptions, outgoingSpending, spendingByMonth } from './spending-analytics'
import { FinanceTableDrawer } from './finance-table-drawer'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** A non-zero change from zero is infinite rather than absent, so every KPI retains its starting-period comparison. */
function delta(current: number, previous: number, goodDirection: 'up' | 'down', label: string): StatDelta | undefined {
  if (previous === 0) {
    if (current === 0) return { value: 0, goodDirection, label }
    return { value: current > 0 ? Infinity : -Infinity, goodDirection, label }
  }
  return { value: (current - previous) / Math.abs(previous), goodDirection, label }
}

type CapitalMetric = 'capital' | 'fixedIncome' | 'variableIncome' | 'spending'

/** The selected period defines the comparison; the compact tile only draws its latest six months. */
function capitalMetric(points: CapitalEvolutionPoint[], metric: CapitalMetric, goodDirection: 'up' | 'down', label: string) {
  const values = points.map((point) => point[metric])
  const current = values.at(-1) ?? 0
  const starting = values[0] ?? 0
  return {
    current,
    sparkline: values.slice(-6),
    delta: delta(current, starting, goodDirection, label),
  }
}

export function OverviewPanel() {
  const { t } = useTranslation(['finances', 'common', 'investments'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleCategory, clearCategories } = useDashboardFilters()
  const rows = useDashboardEntries(filters)
  const selectedRange = useMemo(() => resolveFilterRange(filters), [filters])
  const investmentRows = useInvestmentRows()

  // Capital must begin at the first matching entry, not at the start of the
  // selected window. The displayed points remain scoped to that window, while the
  // running total retains the complete prior history that establishes their value.
  const capitalHistoryFilters: DashboardFilters = useMemo(
    () => ({ ...filters, preset: 'custom', customFrom: '', customTo: '' }),
    [filters],
  )
  const capitalHistoryRows = useDashboardEntries(capitalHistoryFilters)
  const investmentHistory = useMemo<InvestmentValueEntry[]>(
    () => investmentRows.map((row) => {
      const transaction = asTransaction(row)
      // A row on the investments screen is an investment; the class is only which of
      // the two lines it joins, and an investment nobody called fixed is variable.
      return { ...transaction, investmentClass: isFixedIncome(row) ? 'fixedIncome' : 'variableIncome' }
    }),
    [investmentRows],
  )
  const capitalData = useMemo(
    () => capitalEvolution(capitalHistoryRows, selectedRange, investmentHistory),
    [capitalHistoryRows, selectedRange, investmentHistory],
  )

  const comparisonLabel = t('finances:overview.startingPeriod')
  const currentCapital = useMemo(() => capitalMetric(capitalData, 'capital', 'up', comparisonLabel), [capitalData, comparisonLabel])
  const fixedIncome = useMemo(() => capitalMetric(capitalData, 'fixedIncome', 'up', comparisonLabel), [capitalData, comparisonLabel])
  const variableIncome = useMemo(() => capitalMetric(capitalData, 'variableIncome', 'up', comparisonLabel), [capitalData, comparisonLabel])
  const spending = useMemo(() => capitalMetric(capitalData, 'spending', 'down', comparisonLabel), [capitalData, comparisonLabel])

  const categoryAverages = useMemo(
    () => averageSpendByCategory(rows, capitalData.map((point) => point.month)),
    [capitalData, rows],
  )

  // Where the money sits is now told by where it came from: each imported file is a
  // statement, and its rows net to what that statement leaves behind.
  const balancesBySource = useMemo(() => {
    const totals = new Map<string, number>()
    for (const entry of capitalHistoryRows) {
      totals.set(entry.sourceFilename, (totals.get(entry.sourceFilename) ?? 0) + entry.value)
    }
    return [...totals.entries()].map(([filename, value]) => ({ key: filename, label: filename, value }))
  }, [capitalHistoryRows])

  // Every entry in the selected period, not just the most recent — the card scrolls
  // instead of truncating (see DashboardCard's fixed height + overflow-auto body).
  const periodEntries = useMemo(() => [...rows].sort((a, b) => b.date - a.date), [rows])

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
              value={currency.format(currentCapital.current)}
              indicatorColor={DOMAIN_COLOR.balance.light}
              delta={currentCapital.delta}
              sparkline={currentCapital.sparkline}
            />
            <StatTile
              label={t('investments:items.fixedIncome')}
              value={currency.format(fixedIncome.current)}
              indicatorColor={DOMAIN_COLOR.fixedIncome.light}
              delta={fixedIncome.delta}
              sparkline={fixedIncome.sparkline}
            />
            <StatTile
              label={t('investments:items.variableIncome')}
              value={currency.format(variableIncome.current)}
              indicatorColor={DOMAIN_COLOR.variableIncome.light}
              delta={variableIncome.delta}
              sparkline={variableIncome.sparkline}
            />
            <StatTile
              label={t('common:dashboard.spending')}
              value={currency.format(spending.current)}
              indicatorColor={DIVERGING_PAIR.negative.light}
              delta={spending.delta}
              sparkline={spending.sparkline}
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
                  variableIncomeLabel={t('investments:items.variableIncome')}
                  fixedIncomeLabel={t('investments:items.fixedIncome')}
                />
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:overview.spendingCategories')} className="h-[320px]">
              <RankedBarList
                items={categoryAverages}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:spending.noSpending')}
                variant="underlined"
              />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard title={t('finances:overview.bySource')} className="h-[260px] lg:col-span-1">
              <RankedBarList
                items={balancesBySource}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:overview.noEntries')}
              />
            </DashboardCard>

            <DashboardCard
              title={t('finances:overview.entries')}
              className="h-[260px] lg:col-span-2"
              bodyClassName="overflow-auto p-0"
            >
              {periodEntries.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">
                  {t('finances:overview.noEntries')}
                </p>
              ) : (
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col className="w-14" />
                    <col />
                    <col className="w-[400px]" />
                    <col className="w-24" />
                  </colgroup>
                  <tbody>
                    {periodEntries.map((entry, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="text-muted-foreground overflow-hidden p-2 whitespace-nowrap">{formatDateLabel(entry.date)}</td>
                        <td className="overflow-hidden p-2 text-ellipsis whitespace-nowrap" title={entry.description}>
                          {entry.description || entry.category}
                        </td>
                        <td className="p-2 text-center">
                          <CategoryPill label={entry.category} wrap />
                        </td>
                        <td
                          className={`p-2 text-right tabular-nums ${entry.value > 0 ? 'text-brand' : ''}`}
                        >
                          {entry.value > 0 ? '+' : '-'}
                          {currency.format(Math.abs(entry.value))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashboardCard>
          </div>
        </div>
        </FinanceTableDrawer>
      </div>
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
