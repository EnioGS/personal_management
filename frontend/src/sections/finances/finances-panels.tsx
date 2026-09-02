import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { colorForKey, DIVERGING_PAIR, DOMAIN_COLOR, MAX_CATEGORICAL_SERIES } from '@/components/charts/chart-colors'
import { DivergingBarChart } from '@/components/charts/diverging-bar-chart'
import { CategoryPill } from '@/components/dashboard/category-pill'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { RankedBarList } from '@/components/dashboard/ranked-bar-list'
import { StatTile, type StatDelta } from '@/components/dashboard/stat-tile'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { resolveFilterRange, useDashboardFilters, type DashboardFilters } from '@/components/dashboard/dashboard-filters'
import { useDashboardEntries, type FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { TableWorkspace } from '@/components/data-table/table-workspace'
import { Button } from '@/components/ui/button'
import { bucketByMonth, foldTopCategories, formatDateLabel, formatMonthLabel, groupByKey } from '@/lib/aggregations'
import { previousEquivalentRange } from '@/lib/dashboard/date-range'
import { useAccountsStore, useEntriesStore, useTableDefsStore } from '@/lib/model/model-stores'
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

interface MonthlyTotals {
  month: string
  in: number
  out: number
  cardSpend: number
  // DivergingBarChart's data prop wants a plain indexable row, same as any other chart data.
  [key: string]: string | number
}

function monthlyTotals(rows: FilteredEntry[]): MonthlyTotals[] {
  const perMonth = new Map<string, MonthlyTotals>()
  for (const row of rows) {
    const month = formatMonthKey(row.date)
    const bucket = perMonth.get(month) ?? { month, in: 0, out: 0, cardSpend: 0 }
    if (row.direction === 'in') bucket.in += row.amount
    else bucket.out += row.amount
    if (row.cardId) bucket.cardSpend += row.amount
    perMonth.set(month, bucket)
  }
  return [...perMonth.values()].sort((a, b) => a.month.localeCompare(b.month))
}

interface PeriodTotals {
  totalIn: number
  totalOut: number
  cardSpend: number
  net: number
}

function sumTotals(rows: FilteredEntry[]): PeriodTotals {
  let totalIn = 0
  let totalOut = 0
  let cardSpend = 0
  for (const row of rows) {
    if (row.direction === 'in') totalIn += row.amount
    else totalOut += row.amount
    if (row.cardId) cardSpend += row.amount
  }
  return { totalIn, totalOut, cardSpend, net: totalIn - totalOut }
}

/** No comparison when there's nothing to divide by — a delta needs a non-zero referent. */
function delta(current: number, previous: number, goodDirection: 'up' | 'down', label: string): StatDelta | undefined {
  if (previous === 0) return undefined
  return { value: (current - previous) / Math.abs(previous), goodDirection, label }
}

export function OverviewPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, toggleAccount, toggleCard, toggleCategory } =
    useDashboardFilters()
  const rows = useDashboardEntries(filters)
  const [splitByAccount, setSplitByAccount] = useState(false)

  // The immediately preceding, equal-length period, under the same account/card/
  // category filters — what every KPI's delta is measured against.
  const previousFilters: DashboardFilters = useMemo(() => {
    const previous = previousEquivalentRange(resolveFilterRange(filters))
    return {
      ...filters,
      preset: 'custom',
      customFrom: new Date(previous.from).toISOString().slice(0, 10),
      customTo: new Date(previous.to).toISOString().slice(0, 10),
    }
  }, [filters])
  const previousRows = useDashboardEntries(previousFilters)

  const totals = useMemo(() => sumTotals(rows), [rows])
  const previousTotals = useMemo(() => sumTotals(previousRows), [previousRows])
  const comparisonLabel = t('finances:overview.previousPeriod')

  const monthly = useMemo(() => monthlyTotals(rows), [rows])
  const sparklineWindow = monthly.slice(-6)
  const netSparkline = sparklineWindow.map((m) => m.in - m.out)
  const inSparkline = sparklineWindow.map((m) => m.in)
  const outSparkline = sparklineWindow.map((m) => m.out)
  const cardSparkline = sparklineWindow.map((m) => m.cardSpend)

  const { data: splitData, accountNames } = useMemo(
    () => monthlyNetByAccount(rows, t('common:chart.other')),
    [rows, t],
  )

  const outgoingByCategory = useMemo(() => {
    // amount > 0, not just direction === 'out': a cardLedger row has no direction of
    // its own and always counts as "out", but a negative amount there is a refund/
    // credit, not spend — it belongs in the total, not in "where money went".
    const outgoing = rows.filter((row) => row.direction === 'out' && row.amount > 0)
    const grouped = groupByKey(outgoing, 'category', 'amount')
    return foldTopCategories(grouped, MAX_CATEGORICAL_SERIES, t('common:chart.other')).map((g) => ({
      key: g.label,
      label: g.label,
      value: g.value,
    }))
  }, [rows, t])

  const accounts = useAccountsStore((s) => s.items).filter((a) => !a.archived)
  const tableDefs = useTableDefsStore((s) => s.items)
  const allEntries = useEntriesStore((s) => s.items)
  const accountBalances = useMemo(() => {
    return accounts.map((account) => {
      const tableIds = new Set(
        tableDefs.filter((table) => table.kind === 'bankLedger' && table.accountId === account.id).map((table) => table.id),
      )
      let balance = 0
      for (const entry of allEntries) {
        if (entry.deleted || !tableIds.has(entry.tableId)) continue
        const amount = typeof entry.amount === 'number' ? entry.amount : 0
        balance += entry.direction === 'in' ? amount : -amount
      }
      return { key: String(account.id), label: account.name, value: balance }
    })
  }, [accounts, tableDefs, allEntries])

  const recentEntries = useMemo(() => [...rows].sort((a, b) => b.date - a.date).slice(0, 10), [rows])

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
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile
              label={t('common:dashboard.netBalance')}
              value={currency.format(totals.net)}
              indicatorColor={DOMAIN_COLOR.balance.light}
              delta={delta(totals.net, previousTotals.net, 'up', comparisonLabel)}
              sparkline={netSparkline}
            />
            <StatTile
              label={t('common:dashboard.totalIn')}
              value={currency.format(totals.totalIn)}
              indicatorColor={DIVERGING_PAIR.positive.light}
              delta={delta(totals.totalIn, previousTotals.totalIn, 'up', comparisonLabel)}
              sparkline={inSparkline}
            />
            <StatTile
              label={t('common:dashboard.totalOut')}
              value={currency.format(totals.totalOut)}
              indicatorColor={DIVERGING_PAIR.negative.light}
              delta={delta(totals.totalOut, previousTotals.totalOut, 'down', comparisonLabel)}
              sparkline={outSparkline}
            />
            <StatTile
              label={t('common:dashboard.cardSpend')}
              value={currency.format(totals.cardSpend)}
              indicatorColor={DOMAIN_COLOR.cards.light}
              delta={delta(totals.cardSpend, previousTotals.cardSpend, 'down', comparisonLabel)}
              sparkline={cardSparkline}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <DashboardCard
              title={t('finances:overview.monthlyFlow')}
              className="col-span-2 h-[320px]"
              bodyClassName="p-2"
              action={
                <div className="flex items-center gap-1 rounded-md border p-0.5">
                  <Button
                    type="button"
                    variant={!splitByAccount ? 'secondary' : 'ghost'}
                    size="xs"
                    aria-pressed={!splitByAccount}
                    onClick={() => setSplitByAccount(false)}
                  >
                    {t('common:dashboard.aggregate')}
                  </Button>
                  <Button
                    type="button"
                    variant={splitByAccount ? 'secondary' : 'ghost'}
                    size="xs"
                    aria-pressed={splitByAccount}
                    onClick={() => setSplitByAccount(true)}
                  >
                    {t('common:dashboard.splitByAccount')}
                  </Button>
                </div>
              }
            >
              {splitByAccount ? (
                <AppLineChart
                  data={splitData}
                  xKey="month"
                  xFormatter={formatMonthLabel}
                  series={accountNames.map((name) => ({ key: name, label: name, color: colorForKey(name) }))}
                />
              ) : (
                <DivergingBarChart
                  data={monthly}
                  xKey="month"
                  positiveKey="in"
                  negativeKey="out"
                  positiveLabel={t('common:dashboard.inLabel')}
                  negativeLabel={t('common:dashboard.outLabel')}
                  xFormatter={formatMonthLabel}
                  valueFormatter={(v) => currency.format(v)}
                />
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:overview.whereItWent')} className="h-[320px]">
              <RankedBarList
                items={outgoingByCategory}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:overview.noOutgoing')}
              />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DashboardCard title={t('finances:overview.accounts')} className="h-[260px]">
              <RankedBarList
                items={accountBalances}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:overview.noAccounts')}
              />
            </DashboardCard>

            <DashboardCard title={t('finances:overview.recentEntries')} className="h-[260px]" bodyClassName="overflow-auto p-0">
              {recentEntries.length === 0 ? (
                <p className="text-muted-foreground flex h-full items-center justify-center text-xs">
                  {t('finances:overview.noEntries')}
                </p>
              ) : (
                <table className="w-full table-fixed text-xs">
                  <colgroup>
                    <col className="w-14" />
                    <col />
                    <col className="w-28" />
                    <col className="w-24" />
                  </colgroup>
                  <tbody>
                    {recentEntries.map((entry, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="text-muted-foreground overflow-hidden p-2 whitespace-nowrap">{formatDateLabel(entry.date)}</td>
                        <td className="overflow-hidden p-2 text-ellipsis whitespace-nowrap" title={entry.description}>
                          {entry.description || entry.category}
                        </td>
                        <td className="overflow-hidden p-2">
                          <CategoryPill label={entry.category} />
                        </td>
                        <td
                          className={`p-2 text-right tabular-nums ${entry.direction === 'in' ? 'text-brand' : ''}`}
                        >
                          {entry.direction === 'in' ? '+' : '-'}
                          {currency.format(entry.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </DashboardCard>
          </div>
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
