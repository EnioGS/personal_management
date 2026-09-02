import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { colorForKey, DIVERGING_PAIR, DOMAIN_COLOR, MAX_CATEGORICAL_SERIES } from '@/components/charts/chart-colors'
import { DivergingBarChart } from '@/components/charts/diverging-bar-chart'
import { StatTile } from '@/components/dashboard/stat-tile'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { useDashboardFilters } from '@/components/dashboard/dashboard-filters'
import { useDashboardEntries, type FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { TableWorkspace } from '@/components/data-table/table-workspace'
import { Button } from '@/components/ui/button'
import { bucketByMonth, foldTopCategories, formatMonthLabel, groupByKey } from '@/lib/aggregations'
import type { TableKind } from '@/lib/model/types'
import { useActiveTableEntries } from '@/lib/model/use-model-data'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** One row per month, split by account instead of combined — the "By account" toggle. */
function monthlyNetByAccount(rows: FilteredEntry[], otherLabel: string) {
  const totalsByAccount = new Map<string, number>()
  for (const row of rows) {
    const label = row.accountName ?? otherLabel
    const signed = row.direction === 'in' ? row.amount : -row.amount
    totalsByAccount.set(label, (totalsByAccount.get(label) ?? 0) + signed)
  }
  const kept = new Set(
    foldTopCategories(
      [...totalsByAccount.entries()].map(([label, value]) => ({ label, value: Math.abs(value) })),
      MAX_CATEGORICAL_SERIES,
      otherLabel,
    )
      .map((d) => d.label)
      .filter((label) => label !== otherLabel),
  )

  const perMonth = new Map<string, Map<string, number>>()
  for (const row of rows) {
    const month = formatMonthKey(row.date)
    const rawLabel = row.accountName ?? otherLabel
    const label = kept.has(rawLabel) ? rawLabel : otherLabel
    const signed = row.direction === 'in' ? row.amount : -row.amount
    if (!perMonth.has(month)) perMonth.set(month, new Map())
    const byAccount = perMonth.get(month)!
    byAccount.set(label, (byAccount.get(label) ?? 0) + signed)
  }

  const accountNames = [...kept, otherLabel].filter((name) => [...perMonth.values()].some((m) => m.has(name)))
  const data = [...perMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, byAccount]) => ({ month, ...Object.fromEntries(byAccount) }))
  return { data, accountNames }
}

// Dates are stored as UTC-midnight epoch ms (see lib/aggregations.ts) — bucket in UTC to match.
function formatMonthKey(epochMs: number): string {
  const d = new Date(epochMs)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export function OverviewPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleAccount, toggleCard, toggleCategory } =
    useDashboardFilters()
  const rows = useDashboardEntries(filters)
  const [splitByAccount, setSplitByAccount] = useState(false)

  const totals = useMemo(() => {
    let totalIn = 0
    let totalOut = 0
    let cardSpend = 0
    for (const row of rows) {
      if (row.direction === 'in') totalIn += row.amount
      else totalOut += row.amount
      if (row.cardId) cardSpend += row.amount
    }
    return { totalIn, totalOut, cardSpend, net: totalIn - totalOut }
  }, [rows])

  const monthlyInOut = useMemo(() => {
    const perMonth = new Map<string, { in: number; out: number }>()
    for (const row of rows) {
      const month = formatMonthKey(row.date)
      const bucket = perMonth.get(month) ?? { in: 0, out: 0 }
      if (row.direction === 'in') bucket.in += row.amount
      else bucket.out += row.amount
      perMonth.set(month, bucket)
    }
    return [...perMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }))
  }, [rows])

  const { data: splitData, accountNames } = useMemo(
    () => monthlyNetByAccount(rows, t('common:chart.other')),
    [rows, t],
  )

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        setPreset={setPreset}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
        toggleAccount={toggleAccount}
        toggleCard={toggleCard}
        toggleCategory={toggleCategory}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <div className="flex flex-wrap gap-3">
          <StatTile label={t('common:dashboard.netBalance')} value={currency.format(totals.net)} indicatorColor={DOMAIN_COLOR.balance.light} />
          <StatTile label={t('common:dashboard.totalIn')} value={currency.format(totals.totalIn)} indicatorColor={DIVERGING_PAIR.positive.light} />
          <StatTile label={t('common:dashboard.totalOut')} value={currency.format(totals.totalOut)} indicatorColor={DIVERGING_PAIR.negative.light} />
          <StatTile label={t('common:dashboard.cardSpend')} value={currency.format(totals.cardSpend)} indicatorColor={DOMAIN_COLOR.cards.light} />
        </div>

        <div className="flex items-center justify-end gap-1 rounded-md border p-0.5 self-end">
          <Button type="button" variant={!splitByAccount ? 'secondary' : 'ghost'} size="xs" aria-pressed={!splitByAccount} onClick={() => setSplitByAccount(false)}>
            {t('common:dashboard.aggregate')}
          </Button>
          <Button type="button" variant={splitByAccount ? 'secondary' : 'ghost'} size="xs" aria-pressed={splitByAccount} onClick={() => setSplitByAccount(true)}>
            {t('common:dashboard.splitByAccount')}
          </Button>
        </div>

        <div className="min-h-0 flex-1">
          {splitByAccount ? (
            <AppLineChart
              data={splitData}
              xKey="month"
              xFormatter={formatMonthLabel}
              series={accountNames.map((name) => ({ key: name, label: name, color: colorForKey(name) }))}
            />
          ) : (
            <DivergingBarChart
              data={monthlyInOut}
              xKey="month"
              positiveKey="in"
              negativeKey="out"
              positiveLabel={t('common:dashboard.inLabel')}
              negativeLabel={t('common:dashboard.outLabel')}
              xFormatter={formatMonthLabel}
              valueFormatter={(v) => currency.format(v)}
            />
          )}
        </div>
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
