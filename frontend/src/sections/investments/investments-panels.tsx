import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { CATEGORICAL_PALETTE, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { TableWorkspace } from '@/components/data-table/table-workspace'
import { bucketByMonth, formatDateLabel, formatMonthLabel, runningPositionOverTime } from '@/lib/aggregations'
import { getCurrentValue, type Transaction } from '@/lib/current-value'
import { useActiveTableEntries, useEntriesOfKinds } from '@/lib/model/use-model-data'

export function OverviewPanel() {
  const { t } = useTranslation('investments')
  const rows = useEntriesOfKinds(['investmentLedger'])
  const visible = rows.filter((row) => !row.deleted) as unknown as Transaction[]

  const lineData = runningPositionOverTime(visible)
  const pieData = allocationPieData(visible)

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

function allocationPieData(items: Transaction[]) {
  const visibleItems = items.filter((t) => !t.deleted)
  const assets = [...new Set(visibleItems.map((t) => t.asset))]
  return assets
    .map((asset, i) => ({
      key: asset,
      label: asset,
      value: getCurrentValue(asset, visibleItems),
      color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
    }))
    .filter((slice) => slice.value > 0)
}

function TransactionLedgerPanel({
  workspaceId,
  title,
  color,
}: {
  workspaceId: string
  title: string
  color: (typeof DOMAIN_COLOR)['variableIncome']
}) {
  const rows = useActiveTableEntries(workspaceId, ['investmentLedger'])
  const visible = rows.filter((row) => !row.deleted) as unknown as Transaction[]

  const lineData = runningPositionOverTime(visible)
  const pieData = allocationPieData(visible)

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id={workspaceId}
          chart={
            <div className="grid h-full grid-cols-2 gap-4 p-4">
              <AppLineChart
                data={lineData}
                xKey="date"
                xFormatter={formatDateLabel}
                series={[{ key: 'value', label: title, color }]}
              />
              <AppPieChart data={pieData} />
            </div>
          }
          table={<TableWorkspace workspaceId={workspaceId} kinds={['investmentLedger']} />}
        />
      </div>
    </div>
  )
}

export function VariableIncomePanel() {
  const { t } = useTranslation('investments')
  return (
    <TransactionLedgerPanel
      workspaceId="variableIncome"
      title={t('items.variableIncome')}
      color={DOMAIN_COLOR.variableIncome}
    />
  )
}

export function FixedIncomePanel() {
  const { t } = useTranslation('investments')
  return (
    <TransactionLedgerPanel workspaceId="fixedIncome" title={t('items.fixedIncome')} color={DOMAIN_COLOR.fixedIncome} />
  )
}

export function ContributionsPanel() {
  const { t } = useTranslation('investments')
  const rows = useActiveTableEntries('contributions', ['contributions'])
  const visible = rows.filter((row) => !row.deleted)

  const barData = bucketByMonth(visible, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id="contributions"
          chart={
            <div className="h-full p-4">
              <AppBarChart
                data={barData}
                xKey="month"
                xFormatter={formatMonthLabel}
                series={{ key: 'amount', label: t('items.contributions'), color: DOMAIN_COLOR.contributions }}
              />
            </div>
          }
          table={<TableWorkspace workspaceId="contributions" kinds={['contributions']} />}
        />
      </div>
    </div>
  )
}
