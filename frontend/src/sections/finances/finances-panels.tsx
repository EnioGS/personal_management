import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { CATEGORICAL_PALETTE, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { TableWorkspace } from '@/components/data-table/table-workspace'
import { bucketByMonth, formatDateLabel, formatMonthLabel, groupByKey, runningBalance } from '@/lib/aggregations'
import { useActiveTableEntries, useEntriesOfKinds } from '@/lib/model/use-model-data'

/** Kinds that hold money movements, in the order a workspace should offer them. */
const MONEY_KINDS = ['generic', 'bankLedger', 'cardLedger'] as const

export function OverviewPanel() {
  const { t } = useTranslation('finances')
  const rows = useEntriesOfKinds(['generic', 'bankLedger', 'cardLedger'])

  // Until dashboards land (Phase 5), Overview reads every money table at once so it
  // reflects the same data the leaf panels write, rather than a stale snapshot.
  const { incoming, outgoing } = useMemo(() => {
    const incoming: { date: number; amount: number }[] = []
    const outgoing: { date: number; amount: number }[] = []
    for (const row of rows) {
      if (row.deleted) continue
      const amount = typeof row.amount === 'number' ? row.amount : 0
      const date = typeof row.date === 'number' ? row.date : 0
      ;(row.direction === 'in' ? incoming : outgoing).push({ date, amount })
    }
    return { incoming, outgoing }
  }, [rows])

  const balanceData = runningBalance(incoming, outgoing)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="min-h-0 flex-1">
        <AppLineChart
          data={balanceData}
          xKey="date"
          xFormatter={formatDateLabel}
          series={[{ key: 'balance', label: t('items.overview'), color: DOMAIN_COLOR.balance }]}
        />
      </div>
    </div>
  )
}

function MoneyPanel({ workspaceId, label, color }: { workspaceId: string; label: string; color: typeof DOMAIN_COLOR.spending }) {
  const rows = useActiveTableEntries(workspaceId, [...MONEY_KINDS])
  const visible = rows.filter((row) => !row.deleted)

  const lineData = bucketByMonth(visible, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))
  const pieData = groupByKey(visible, 'category', 'amount').map((d, i) => ({
    key: d.label,
    label: d.label,
    value: d.value,
    color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
  }))

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id={workspaceId}
          chart={
            <div className="grid h-full grid-cols-2 gap-4 p-4">
              <AppLineChart
                data={lineData}
                xKey="month"
                xFormatter={formatMonthLabel}
                series={[{ key: 'amount', label, color }]}
              />
              <AppPieChart data={pieData} />
            </div>
          }
          table={<TableWorkspace workspaceId={workspaceId} kinds={[...MONEY_KINDS]} />}
        />
      </div>
    </div>
  )
}

export function SpendingPanel() {
  const { t } = useTranslation('finances')
  return <MoneyPanel workspaceId="spending" label={t('items.spending')} color={DOMAIN_COLOR.spending} />
}

export function IncomePanel() {
  const { t } = useTranslation('finances')
  return <MoneyPanel workspaceId="income" label={t('items.income')} color={DOMAIN_COLOR.income} />
}
