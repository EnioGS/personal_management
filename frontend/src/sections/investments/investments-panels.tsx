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
import { computePositions, getCurrentValue, type Transaction } from '@/lib/current-value'
import { asTransaction, isFixedIncome, isVariableIncome, useInvestmentRows } from '@/lib/model/investment-rows'
import type { ConfirmedRow } from '@/lib/model/types'
import { AllocationPanel } from './allocation-panel'

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
export function InvestmentsPanel() {
  const { t } = useTranslation(['investments', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleCategory, clearCategories } = useDashboardFilters()
  const all = useInvestmentRows()
  // Scoped like every other screen: the period on the bar above is what the numbers are
  // about, so a position here is what the chosen window bought and sold.
  const investmentRows = useMemo(() => {
    const range = resolveFilterRange(filters)
    return all.filter((row) => (
      (typeof row.date !== 'number' || isWithinRange(row.date, range))
      && (filters.categories.length === 0 || filters.categories.includes(row.category))
    ))
  }, [all, filters])
  const transactions = useMemo(() => investmentRows.map(asTransaction), [investmentRows])
  // Contributions and dividends are the same ledger read two ways — money put in, and
  // money the holdings paid out.
  const contributionRows = transactions.filter((row) => row.type === 'buy').map(withInvestedAmount)
  const dividendRows = transactions.filter((row) => row.type === 'income').map(withInvestedAmount)
  const positions = useMemo(() => computePositions(transactions), [transactions])
  const totalValue = positions.reduce((sum, position) => sum + position.currentValue, 0)
  // The class is a property of the investment, not of any table it lives in: the rows
  // sit on one screen, and each says which class it is.
  const classValue = (belongs: (row: (typeof investmentRows)[number]) => boolean) =>
    computePositions(investmentRows.filter(belongs).map(asTransaction))
      .reduce((sum, position) => sum + position.currentValue, 0)
  const variableValue = classValue(isVariableIncome)
  const fixedValue = classValue(isFixedIncome)
  const contributions = contributionRows.reduce((sum, row) => sum + row.amount, 0)
  const dividends = dividendRows.reduce((sum, row) => sum + row.amount, 0)
  const contributionData = bucketByMonth(contributionRows, 'date', 'amount').map((row) => ({ month: row.month, amount: row.total }))
  const dividendData = bucketByMonth(dividendRows, 'date', 'amount').map((row) => ({ month: row.month, amount: row.total }))
  const lineData = runningPositionOverTime(transactions)
  const allocation = allocationPieData(transactions, t('common:chart.other'))
  const positionItems = positions.map((position) => ({ key: position.asset, label: position.asset, value: position.currentValue }))

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
        
            <div className="h-full overflow-auto p-4">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <StatTile label={t('items.overview')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)} indicator={DOMAIN_COLOR.balance} />
                  <StatTile label={t('items.variableIncome')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(variableValue)} indicator={DOMAIN_COLOR.variableIncome} />
                  <StatTile label={t('items.fixedIncome')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fixedValue)} indicator={DOMAIN_COLOR.fixedIncome} />
                  <StatTile label={t('items.contributions')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contributions)} indicator={DOMAIN_COLOR.contributions} />
                  <StatTile label={t('items.dividends')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dividends)} indicator={DOMAIN_COLOR.dividends} />
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <DashboardCard title={t('items.overview')} className="h-[320px] lg:col-span-2" bodyClassName="p-2">
                    <AppLineChart data={lineData} xKey="date" xFormatter={formatDateLabel} series={[{ key: 'value', label: t('items.overview'), color: DOMAIN_COLOR.balance }]} />
                  </DashboardCard>
                  <DashboardCard title={t('items.allocation')} className="h-[320px]" bodyClassName="p-2">
                    <AppPieChart data={allocation} />
                  </DashboardCard>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                  <DashboardCard title={t('items.positions')} className="h-[260px] lg:col-span-2">
                    <RankedBarList items={positionItems} valueFormatter={(value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)} emptyLabel={t('positions.noPositions')} />
                  </DashboardCard>
                  <DashboardCard title={t('items.allocation')} className="h-[260px]" bodyClassName="overflow-auto p-3">
                    <AllocationPanel embedded />
                  </DashboardCard>
                </div>
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <DashboardCard title={t('items.contributions')} className="h-[260px]" bodyClassName="p-2">
                    <AppBarChart data={contributionData} xKey="month" xFormatter={formatMonthLabel} series={{ key: 'amount', label: t('items.contributions'), color: DOMAIN_COLOR.contributions }} />
                  </DashboardCard>
                  <DashboardCard title={t('items.dividends')} className="h-[260px]" bodyClassName="p-2">
                    <AppBarChart data={dividendData} xKey="month" xFormatter={formatMonthLabel} series={{ key: 'amount', label: t('items.dividends'), color: DOMAIN_COLOR.dividends }} />
                  </DashboardCard>
                </div>
              </div>
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
