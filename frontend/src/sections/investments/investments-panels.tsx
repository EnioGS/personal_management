import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { colorForKey, DOMAIN_COLOR, MAX_CATEGORICAL_SERIES } from '@/components/charts/chart-colors'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { resolveFilterRange, useDashboardFilters } from '@/components/dashboard/dashboard-filters'
import { isWithinRange } from '@/lib/dashboard/date-range'
import { RankedBarList } from '@/components/dashboard/ranked-bar-list'
import { StatTile } from '@/components/dashboard/stat-tile'
import { bucketByMonth, foldTopCategories, formatDateLabel, formatMonthLabel, runningPositionOverTime } from '@/lib/aggregations'
import { getCurrentValue, type Transaction } from '@/lib/current-value'
import { asTransaction, INVESTMENTS_SCREEN, isFixedIncome, isVariableIncome, useInvestmentRows } from '@/lib/model/investment-rows'
import { useDashboardEntries } from '@/components/dashboard/use-dashboard-entries'
import { capitalMetric } from '@/lib/dashboard/capital-metric'
import { holdingsSplit } from '@/lib/dashboard/holdings-split'
import { investmentMonths } from '@/lib/dashboard/investment-months'
import { HoldingsPie } from '@/components/charts/holdings-pie'
import type { ConfirmedRow } from '@/lib/model/types'
import { AllocationPanel } from './allocation-panel'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
/** Changes sit under the number in a quarter of its space, the way they do on Movements. */
const compactCurrency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })

export function OverviewPanel() {
  const { t } = useTranslation(['investments', 'common'])
  const visible = useInvestmentRows().map(asTransaction)

  const lineData = runningPositionOverTime(visible)
  const pieData = allocationPieData(visible, t('common:chart.other'))

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <AppLineChart
          data={lineData}
          xKey="date"
          xFormatter={formatDateLabel}
          series={[{ key: 'value', label: t('items.overview'), color: DOMAIN_COLOR.balance }]}
        />
        <AppPieChart data={pieData} />
      </div>
    </div>
  )
}

/**
 * The single Investments surface inside Finances. It brings together the old
 * overview, positions, allocation, transaction classes, contributions and
 * dividends; the drawer below remains the place to add and edit every ledger.
 */
/**
 * What is held, in what, and what it has paid out.
 *
 * Built on the same holdings model the Movements screen reads — a row's class says which
 * pot it is about, and the running total of those is what is held — rather than on
 * positions computed from an asset column that no longer exists.
 *
 * What is deliberately absent is a return. These files are cash flows: they say what was
 * put in and taken out, never what a holding is worth today. Cost basis, what was received
 * and how the composition moved are all honest; "up 7%" would not be.
 */
export function InvestmentsPanel() {
  const { t } = useTranslation(['investments', 'common', 'finances'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleCategory, clearCategories } = useDashboardFilters()

  // The whole history, because a holding is a running total: the window says what to draw,
  // never where the accumulation starts.
  const historyFilters = useMemo(() => ({ ...filters, preset: 'custom' as const, customFrom: '', customTo: '' }), [filters])
  const rows = useDashboardEntries(historyFilters, INVESTMENTS_SCREEN)
  const range = useMemo(() => resolveFilterRange(filters), [filters])

  const allMonths = useMemo(() => investmentMonths(rows), [rows])
  const months = useMemo(
    () => allMonths.filter((month) => isWithinRange(Date.parse(`${month.month}-01`), range)),
    [allMonths, range],
  )
  const holdings = useMemo(() => {
    const named: Record<string, { label: string; color: typeof DOMAIN_COLOR.balance }> = {
      cash: { label: t('finances:overview.cashReserve'), color: DOMAIN_COLOR.balance },
      fixedIncome: { label: t('items.fixedIncome'), color: DOMAIN_COLOR.fixedIncome },
      variableIncome: { label: t('items.variableIncome'), color: DOMAIN_COLOR.variableIncome },
      unclassified: { label: t('finances:overview.unclassifiedHoldings'), color: DOMAIN_COLOR.unclassified },
    }
    return holdingsSplit(rows).map((group) => ({ ...group, ...named[group.key] }))
  }, [rows, t])

  const labels = useMemo(
    () => ({
      lastMonth: t('finances:overview.vsLastMonth'),
      sinceMonth: (month: string) => t('finances:overview.vsMonth', { month: shortMonth.format(new Date(`${month}-01`)) }),
    }),
    [t],
  )
  const held = useMemo(() => capitalMetric(months, 'held', 'up', labels, compactCurrency.format), [months, labels])
  const cash = useMemo(() => capitalMetric(months, 'cash', 'up', labels, compactCurrency.format), [months, labels])
  const fixed = useMemo(() => capitalMetric(months, 'fixedIncome', 'up', labels, compactCurrency.format), [months, labels])
  const received = useMemo(() => capitalMetric(months, 'received', 'up', labels, compactCurrency.format), [months, labels])
  const receivedTotal = months.reduce((sum, month) => sum + month.received, 0)

  // Every paper and pot by name, which is what a class is made of.
  const instruments = useMemo(
    () => holdings.flatMap((group) => group.children.map((child) => ({ ...child, key: child.key, label: child.label }))),
    [holdings],
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
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={t('items.held')}
              value={currency.format(held.current)}
              indicator={DOMAIN_COLOR.balance}
              deltas={held.deltas}
              sparkline={held.sparkline}
            />
            <StatTile
              label={t('items.fixedIncome')}
              value={currency.format(fixed.current)}
              indicator={DOMAIN_COLOR.fixedIncome}
              deltas={fixed.deltas}
              sparkline={fixed.sparkline}
            />
            <StatTile
              label={t('finances:overview.cashReserve')}
              value={currency.format(cash.current)}
              indicator={DOMAIN_COLOR.income}
              deltas={cash.deltas}
              sparkline={cash.sparkline}
            />
            <StatTile
              label={t('items.received')}
              value={currency.format(receivedTotal)}
              indicator={DOMAIN_COLOR.dividends}
              deltas={received.deltas}
              sparkline={received.sparkline}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            {/* Composition and its history in one shape: the stack is what is held, and
                each band is what it is held as. */}
            <DashboardCard title={t('items.heldOverTime')} className="h-[360px] lg:col-span-2" bodyClassName="p-2">
              {months.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('positions.noPositions')}</p>
              ) : (
                <AppBarChart
                  data={months}
                  xKey="month"
                  stacked
                  series={[
                    { key: 'cash', label: t('finances:overview.cashReserve'), color: DOMAIN_COLOR.balance },
                    { key: 'fixedIncome', label: t('items.fixedIncome'), color: DOMAIN_COLOR.fixedIncome },
                    { key: 'variableIncome', label: t('items.variableIncome'), color: DOMAIN_COLOR.variableIncome },
                    { key: 'unclassified', label: t('finances:overview.unclassifiedHoldings'), color: DOMAIN_COLOR.unclassified },
                  ]}
                  xFormatter={formatMonthLabel}
                  valueFormatter={(value) => currency.format(value)}
                />
              )}
            </DashboardCard>

            <DashboardCard title={t('items.allocation')} className="h-[360px]" bodyClassName="p-2">
              <HoldingsPie
                groups={holdings}
                valueFormatter={(value) => currency.format(value)}
                emptyLabel={t('positions.noPositions')}
              />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <DashboardCard title={t('items.positions')} className="h-[280px]">
              <RankedBarList
                items={instruments}
                valueFormatter={(value) => currency.format(value)}
                emptyLabel={t('positions.noPositions')}
                variant="underlined"
              />
            </DashboardCard>

            <DashboardCard
              title={t('items.received')}
              className="h-[280px]"
              bodyClassName="p-2"
              footnote={t('items.receivedFootnote')}
            >
              {months.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('positions.noPositions')}</p>
              ) : (
                <AppBarChart
                  data={months}
                  xKey="month"
                  series={{ key: 'received', label: t('items.received'), color: DOMAIN_COLOR.dividends }}
                  xFormatter={formatMonthLabel}
                  valueFormatter={(value) => currency.format(value)}
                />
              )}
            </DashboardCard>
          </div>

          <DashboardCard title={t('items.allocationTargets')} className="h-[280px]" bodyClassName="overflow-auto p-3">
            <AllocationPanel embedded />
          </DashboardCard>
        </div>
      </div>
    </div>
  )
}


function allocationPieData(items: Transaction[], otherLabel: string) {
  const visibleItems = items.filter((t) => !t.deleted)
  const assets = [...new Set(visibleItems.map((t) => t.asset))]
  const data = assets
    .map((asset) => ({ label: asset, value: getCurrentValue(asset, visibleItems) }))
    .filter((slice) => slice.value > 0)
  return foldTopCategories(data, MAX_CATEGORICAL_SERIES, otherLabel).map((d) => ({
    key: d.label,
    label: d.label,
    value: d.value,
    color: colorForKey(d.label),
  }))
}

function TransactionLedgerPanel({
  title,
  color,
  belongs,
}: {
  title: string
  color: (typeof DOMAIN_COLOR)['variableIncome']
  belongs: (row: ConfirmedRow) => boolean
}) {
  const { t } = useTranslation('common')
  const visible = useInvestmentRows().filter(belongs).map(asTransaction)

  const lineData = runningPositionOverTime(visible)
  const pieData = allocationPieData(visible, t('chart.other'))

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        
            <div className="grid h-full grid-cols-2 gap-4 p-4">
              <AppLineChart
                data={lineData}
                xKey="date"
                xFormatter={formatDateLabel}
                series={[{ key: 'value', label: title, color }]}
              />
              <AppPieChart data={pieData} />
            </div>
      </div>
    </div>
  )
}

export function VariableIncomePanel() {
  const { t } = useTranslation('investments')
  return (
    <TransactionLedgerPanel
      title={t('items.variableIncome')}
      color={DOMAIN_COLOR.variableIncome}
      belongs={isVariableIncome}
    />
  )
}

export function FixedIncomePanel() {
  const { t } = useTranslation('investments')
  return (
    <TransactionLedgerPanel
      title={t('items.fixedIncome')}
      color={DOMAIN_COLOR.fixedIncome}
      belongs={isFixedIncome}
    />
  )
}

export function ContributionsPanel() {
  const { t } = useTranslation('investments')
  const visible = useInvestmentRows().map(asTransaction).filter((row) => row.type === 'buy').map(withInvestedAmount)

  const barData = bucketByMonth(visible, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        
            <div className="h-full p-4">
              <AppBarChart
                data={barData}
                xKey="month"
                xFormatter={formatMonthLabel}
                series={{ key: 'amount', label: t('items.contributions'), color: DOMAIN_COLOR.contributions }}
              />
            </div>
      </div>
    </div>
  )
}

export function DividendsPanel() {
  const { t } = useTranslation('investments')
  const visible = useInvestmentRows().map(asTransaction).filter((row) => row.type === 'income').map(withInvestedAmount)

  const barData = bucketByMonth(visible, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        
            <div className="h-full p-4">
              <AppBarChart
                data={barData}
                xKey="month"
                xFormatter={formatMonthLabel}
                series={{ key: 'amount', label: t('items.dividends'), color: DOMAIN_COLOR.dividends }}
              />
            </div>
      </div>
    </div>
  )
}

/** An investment row states quantity and price; what it moved is their product. */
function withInvestedAmount(row: Transaction): Transaction & { amount: number } {
  return { ...row, amount: row.quantity * row.price }
}
