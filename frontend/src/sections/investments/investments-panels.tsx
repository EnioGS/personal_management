import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { colorForKey, DOMAIN_COLOR, MAX_CATEGORICAL_SERIES } from '@/components/charts/chart-colors'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { RankedBarList } from '@/components/dashboard/ranked-bar-list'
import { StatTile } from '@/components/dashboard/stat-tile'
import { bucketByMonth, foldTopCategories, formatDateLabel, formatMonthLabel, runningPositionOverTime } from '@/lib/aggregations'
import { computePositions, getCurrentValue, type Transaction } from '@/lib/current-value'
import { useEntriesOfKinds } from '@/lib/model/use-model-data'
import type { InvestmentClass } from '@/lib/model/types'
import { AllocationPanel } from './allocation-panel'

export function OverviewPanel() {
  const { t } = useTranslation(['investments', 'common'])
  const rows = useEntriesOfKinds(['investmentLedger'])
  const visible = rows.filter((row) => !row.deleted) as unknown as Transaction[]

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
  const investmentRows = useEntriesOfKinds(['investmentLedger'])
  const contributionRows = useEntriesOfKinds(['contributions'])
  const dividendRows = useEntriesOfKinds(['dividends'])
  const transactions = investmentRows.filter((row) => !row.deleted) as unknown as Transaction[]
  const positions = useMemo(() => computePositions(transactions), [transactions])
  const totalValue = positions.reduce((sum, position) => sum + position.currentValue, 0)
  // The class is a property of the investment, not of the table it lives in: one
  // ledger holds both, and each row says which it is.
  const classValue = (investmentClass: InvestmentClass) => computePositions(
    investmentRows
      .filter((row) => !row.deleted && row.investmentClass === investmentClass) as unknown as Transaction[],
  ).reduce((sum, position) => sum + position.currentValue, 0)
  const variableValue = classValue('variableIncome')
  const fixedValue = classValue('fixedIncome')
  const contributions = contributionRows.filter((row) => !row.deleted).reduce((sum, row) => sum + (typeof row.amount === 'number' ? row.amount : 0), 0)
  const dividends = dividendRows.filter((row) => !row.deleted).reduce((sum, row) => sum + (typeof row.amount === 'number' ? row.amount : 0), 0)
  const contributionData = bucketByMonth(contributionRows.filter((row) => !row.deleted), 'date', 'amount').map((row) => ({ month: row.month, amount: row.total }))
  const dividendData = bucketByMonth(dividendRows.filter((row) => !row.deleted), 'date', 'amount').map((row) => ({ month: row.month, amount: row.total }))
  const lineData = runningPositionOverTime(transactions)
  const allocation = allocationPieData(transactions, t('common:chart.other'))
  const positionItems = positions.map((position) => ({ key: position.asset, label: position.asset, value: position.currentValue }))

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        
            <div className="h-full overflow-auto p-4">
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                  <StatTile label={t('items.overview')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)} indicatorColor={DOMAIN_COLOR.balance.light} />
                  <StatTile label={t('items.variableIncome')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(variableValue)} indicatorColor={DOMAIN_COLOR.variableIncome.light} />
                  <StatTile label={t('items.fixedIncome')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(fixedValue)} indicatorColor={DOMAIN_COLOR.fixedIncome.light} />
                  <StatTile label={t('items.contributions')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(contributions)} indicatorColor={DOMAIN_COLOR.contributions.light} />
                  <StatTile label={t('items.dividends')} value={new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(dividends)} indicatorColor={DOMAIN_COLOR.dividends.light} />
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
  investmentClass,
}: {
  title: string
  color: (typeof DOMAIN_COLOR)['variableIncome']
  investmentClass: InvestmentClass
}) {
  const { t } = useTranslation('common')
  const rows = useEntriesOfKinds(['investmentLedger']).filter((row) => row.investmentClass === investmentClass)
  const visible = rows.filter((row) => !row.deleted) as unknown as Transaction[]

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
      investmentClass="variableIncome"
    />
  )
}

export function FixedIncomePanel() {
  const { t } = useTranslation('investments')
  return (
    <TransactionLedgerPanel
      title={t('items.fixedIncome')}
      color={DOMAIN_COLOR.fixedIncome}
      investmentClass="fixedIncome"
    />
  )
}

export function ContributionsPanel() {
  const { t } = useTranslation('investments')
  const rows = useEntriesOfKinds(['contributions'])
  const visible = rows.filter((row) => !row.deleted)

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
  const rows = useEntriesOfKinds(['dividends'])
  const visible = rows.filter((row) => !row.deleted)

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
