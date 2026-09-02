import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { colorForKey, DOMAIN_COLOR, MAX_CATEGORICAL_SERIES } from '@/components/charts/chart-colors'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { TableWorkspace } from '@/components/data-table/table-workspace'
import {
  bucketByMonth,
  foldTopCategories,
  formatDateLabel,
  formatMonthLabel,
  groupByKey,
  runningBalance,
} from '@/lib/aggregations'
import type { TableKind } from '@/lib/model/types'
import { useActiveTableEntries, useEntriesOfKinds } from '@/lib/model/use-model-data'

/** Every kind that represents money moving, in the order Overview should roll them up. */
const MONEY_KINDS: TableKind[] = ['bankLedger', 'generic', 'cardLedger']

export function OverviewPanel() {
  const { t } = useTranslation('finances')
  const rows = useEntriesOfKinds(MONEY_KINDS)

  // Rolls up every money table at once, so Overview reflects the same data the leaf
  // panels write rather than a stale snapshot of just one of them. Only bankLedger
  // entries carry a real direction; generic and card spend count as outgoing.
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

/** One workspace's chart+table, driven by whichever table kind that workspace holds. */
function LedgerPanel({
  workspaceId,
  kind,
  label,
  color,
  categoryField = 'category',
}: {
  workspaceId: string
  kind: TableKind
  label: string
  color: typeof DOMAIN_COLOR.spending
  categoryField?: string
}) {
  const { t } = useTranslation('common')
  const rows = useActiveTableEntries(workspaceId, [kind])
  const visible = rows.filter((row) => !row.deleted)

  const lineData = bucketByMonth(visible, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))
  const grouped = groupByKey(visible, categoryField, 'amount')
  const pieData = foldTopCategories(grouped, MAX_CATEGORICAL_SERIES, t('chart.other')).map((d) => ({
    key: d.label,
    label: d.label,
    value: d.value,
    color: colorForKey(d.label),
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
          table={<TableWorkspace workspaceId={workspaceId} kinds={[kind]} />}
        />
      </div>
    </div>
  )
}

/** Per-account bank statement: money in and out for whichever account's table is selected. */
export function MovementsPanel() {
  const { t } = useTranslation('finances')
  return (
    <LedgerPanel workspaceId="movements" kind="bankLedger" label={t('items.movements')} color={DOMAIN_COLOR.movements} />
  )
}

/** All outgoing money that isn't a bank account's own statement or a card's own ledger. */
export function SpendingPanel() {
  const { t } = useTranslation('finances')
  return <LedgerPanel workspaceId="spending" kind="generic" label={t('items.spending')} color={DOMAIN_COLOR.spending} />
}

/** Credit-card focus: one table per card. */
export function CardsPanel() {
  const { t } = useTranslation('finances')
  return <LedgerPanel workspaceId="cards" kind="cardLedger" label={t('items.cards')} color={DOMAIN_COLOR.cards} />
}
