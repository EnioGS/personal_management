import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { DIVERGING_PAIR, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { DivergingBarChart } from '@/components/charts/diverging-bar-chart'
import { CategoryPill } from '@/components/dashboard/category-pill'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { RankedBarList } from '@/components/dashboard/ranked-bar-list'
import { StatTile, type StatDelta } from '@/components/dashboard/stat-tile'
import { FilterBar } from '@/components/dashboard/filter-bar'
import { resolveFilterRange, useDashboardFilters, type DashboardFilters } from '@/components/dashboard/dashboard-filters'
import { useDashboardEntries, type FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { formatDateLabel, formatMonthLabel, groupByKey } from '@/lib/aggregations'
import { previousEquivalentRange } from '@/lib/dashboard/date-range'
import { useAccountsStore, useCardsStore, useEntriesStore, useTableDefsStore } from '@/lib/model/model-stores'
import { detectRecurringEntries } from '@/lib/model/recurring'
import { categorySpendChanges, frequentDescriptions, outgoingSpending, spendingByMonth } from './spending-analytics'
import { currentInvoiceCycle, daysUntil, entriesInInvoice, openInstallments } from './card-analytics'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

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
  const { filters, setPreset, setCustomFrom, setCustomTo, selectAccount, selectTable, selectCard, toggleCategory, clearCategories } =
    useDashboardFilters()
  const rows = useDashboardEntries(filters)

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

  const outgoingByCategory = useMemo(() => {
    // amount > 0, not just direction === 'out': a cardLedger row has no direction of
    // its own and always counts as "out", but a negative amount there is a refund/
    // credit, not spend — it belongs in the total, not in "where money went".
    // No folding into "Outros" here — unlike a pie, a ranked list has no slice-count
    // ceiling, it just scrolls (RankedBarList), so every category stays visible.
    const outgoing = rows.filter((row) => row.direction === 'out' && row.amount > 0)
    return groupByKey(outgoing, 'category', 'amount').map((g) => ({ key: g.label, label: g.label, value: g.value }))
  }, [rows])

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
        selectAccount={selectAccount}
        selectTable={selectTable}
        selectCard={selectCard}
        toggleCategory={toggleCategory}
        clearCategories={clearCategories}
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
            >
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
            </DashboardCard>

            <DashboardCard title={t('finances:overview.whereItWent')} className="h-[320px]">
              <RankedBarList
                items={outgoingByCategory}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:overview.noOutgoing')}
              />
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
            <DashboardCard title={t('finances:overview.accounts')} className="h-[260px] lg:col-span-1">
              <RankedBarList
                items={accountBalances}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:overview.noAccounts')}
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

/** Per-account bank statement: money in and out for whichever account's table is selected. */
export function MovementsPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, selectAccount, selectTable, selectCard, toggleCategory, clearCategories } =
    useDashboardFilters()
  const tableDefs = useTableDefsStore((s) => s.items)
  const statements = tableDefs.filter((table) => table.kind === 'bankLedger')
  const hasInitializedStatement = useRef(false)

  useEffect(() => {
    if (hasInitializedStatement.current || statements.length === 0) return
    const statement = statements.find((table) => table.id === filters.tableIds[0]) ?? statements[0]
    selectTable(statement.id)
    selectAccount(statement.accountId ?? null)
    hasInitializedStatement.current = true
  }, [filters.tableIds, selectAccount, selectTable, statements])

  const rows = useDashboardEntries(filters)
  const statementIds = useMemo(() => new Set(statements.map((table) => table.id)), [statements])
  const entries = useMemo(() => rows.filter((row) => statementIds.has(row.tableId)), [rows, statementIds])
  const totals = useMemo(() => sumTotals(entries), [entries])
  const monthly = useMemo(() => monthlyTotals(entries), [entries])
  const categories = useMemo(
    () => groupByKey(entries.filter((row) => row.direction === 'out' && row.amount > 0), 'category', 'amount')
      .map((group) => ({ key: group.label, label: group.label, value: group.value })),
    [entries],
  )
  const topIncoming = useMemo(() => entries.filter((row) => row.direction === 'in').sort((a, b) => b.amount - a.amount).slice(0, 5), [entries])
  const topOutgoing = useMemo(() => entries.filter((row) => row.direction === 'out' && row.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 5), [entries])
  const recurring = useMemo(() => detectRecurringEntries(entries.filter((row) => row.direction === 'out' && row.amount > 0)), [entries])

  function handleSelectTable(id: number | null) {
    selectTable(id)
    const statement = statements.find((table) => table.id === id)
    if (statement?.accountId) selectAccount(statement.accountId)
  }

  function handleSelectAccount(id: number | null) {
    selectAccount(id)
    selectTable(null)
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        setPreset={setPreset}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
        selectAccount={handleSelectAccount}
        selectTable={handleSelectTable}
        selectCard={selectCard}
        toggleCategory={toggleCategory}
        clearCategories={clearCategories}
        show={{ accounts: true, tables: true, cards: false, categories: true }}
        tableKinds={['bankLedger']}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {statements.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('finances:movements.noStatements')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatTile label={t('finances:movements.totalIn')} value={currency.format(totals.totalIn)} indicatorColor={DIVERGING_PAIR.positive.light} sparkline={monthly.map((month) => month.in)} />
              <StatTile label={t('finances:movements.totalOut')} value={currency.format(totals.totalOut)} indicatorColor={DIVERGING_PAIR.negative.light} sparkline={monthly.map((month) => month.out)} />
              <StatTile label={t('finances:movements.periodResult')} value={currency.format(totals.net)} indicatorColor={DOMAIN_COLOR.movements.light} sparkline={monthly.map((month) => month.in - month.out)} />
              <StatTile label={t('finances:movements.entryCount')} value={entries.length.toLocaleString('pt-BR')} indicatorColor={DOMAIN_COLOR.movements.light} />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <DashboardCard title={t('finances:movements.inAndOutByMonth')} className="h-[320px] lg:col-span-2" bodyClassName="p-2">
                {monthly.length === 0 ? (
                  <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:movements.noEntries')}</p>
                ) : (
                  <DivergingBarChart
                    data={monthly}
                    xKey="month"
                    positiveKey="in"
                    negativeKey="out"
                    positiveLabel={t('common:dashboard.inLabel')}
                    negativeLabel={t('common:dashboard.outLabel')}
                    xFormatter={formatMonthLabel}
                    valueFormatter={(value) => currency.format(value)}
                  />
                )}
              </DashboardCard>
              <DashboardCard title={t('finances:movements.topCategories')} className="h-[320px]">
                <RankedBarList items={categories} valueFormatter={(value) => currency.format(value)} emptyLabel={t('finances:movements.noOutgoing')} />
              </DashboardCard>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <DashboardCard title={t('finances:movements.largestEntries')} className="h-[260px]" bodyClassName="p-0">
                <div className="grid h-full grid-cols-2 divide-x">
                  <MovementEntryList title={t('common:dashboard.inLabel')} entries={topIncoming} emptyLabel={t('finances:movements.noIncoming')} />
                  <MovementEntryList title={t('common:dashboard.outLabel')} entries={topOutgoing} emptyLabel={t('finances:movements.noOutgoing')} />
                </div>
              </DashboardCard>
              <DashboardCard title={t('finances:movements.recurringInStatement')} className="h-[260px]" bodyClassName="overflow-auto p-0">
                {recurring.length === 0 ? (
                  <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:movements.noRecurring')}</p>
                ) : (
                  <div className="divide-y">
                    {recurring.map((item) => (
                      <div key={`${item.category}-${item.averageAmount}`} className="flex items-center justify-between gap-3 p-3 text-xs">
                        <div className="min-w-0">
                          <CategoryPill label={item.category} />
                          <p className="text-muted-foreground mt-1">{t('finances:movements.monthCount', { count: item.months.length })}</p>
                        </div>
                        <span className="shrink-0 tabular-nums">{currency.format(item.averageAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function MovementEntryList({ title, entries, emptyLabel }: { title: string; entries: FilteredEntry[]; emptyLabel: string }) {
  return (
    <div className="flex min-h-0 flex-col">
      <p className="text-muted-foreground shrink-0 border-b px-3 py-2 text-[10px] font-medium tracking-wide uppercase">{title}</p>
      {entries.length === 0 ? (
        <p className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center p-3 text-center text-xs">{emptyLabel}</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto divide-y">
          {entries.map((entry) => (
            <div key={`${entry.tableId}-${entry.date}-${entry.description}`} className="flex items-center justify-between gap-2 p-3 text-xs">
              <span className="min-w-0 truncate" title={entry.description}>{entry.description || entry.category}</span>
              <span className="shrink-0 tabular-nums">{currency.format(entry.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Outgoing money across the selected period, accounts, cards, and categories. */
export function SpendingPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, selectAccount, selectTable, selectCard, toggleCategory, clearCategories } =
    useDashboardFilters()
  const rows = useDashboardEntries(filters)
  const spending = useMemo(() => outgoingSpending(rows), [rows])
  const monthlySpending = useMemo(() => spendingByMonth(spending), [spending])
  const categorySpending = useMemo(
    () => groupByKey(spending, 'category', 'amount').map((group) => ({ key: group.label, label: group.label, value: group.value })),
    [spending],
  )
  const monthChanges = useMemo(() => categorySpendChanges(spending), [spending])
  const descriptions = useMemo(() => frequentDescriptions(spending), [spending])

  const totalSpent = spending.reduce((total, row) => total + row.amount, 0)
  const monthlyAverage = monthlySpending.length > 0 ? totalSpent / monthlySpending.length : 0
  const largestExpense = spending.reduce((largest, row) => Math.max(largest, row.amount), 0)
  const byCount = [...descriptions].sort((a, b) => b.count - a.count || b.total - a.total).slice(0, 5)
  const byTotal = [...descriptions].sort((a, b) => b.total - a.total || b.count - a.count).slice(0, 5)

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        setPreset={setPreset}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
        selectAccount={selectAccount}
        selectTable={selectTable}
        selectCard={selectCard}
        toggleCategory={toggleCategory}
        clearCategories={clearCategories}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
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

/** Credit-card focus: one table per card. */
export function CardsPanel() {
  const { t } = useTranslation(['finances', 'common'])
  const { filters, setPreset, setCustomFrom, setCustomTo, selectAccount, selectTable, selectCard, toggleCategory, clearCategories } =
    useDashboardFilters()
  const cards = useCardsStore((s) => s.items).filter((card) => !card.archived)
  const tableDefs = useTableDefsStore((s) => s.items)
  const hasInitializedCard = useRef(false)
  const selectedTable = tableDefs.find((table) => table.id === filters.tableIds[0] && table.kind === 'cardLedger')

  useEffect(() => {
    if (hasInitializedCard.current || cards.length === 0) return
    const cardId = filters.cardIds[0] ?? selectedTable?.cardId ?? cards[0].id
    selectCard(cardId)
    hasInitializedCard.current = true
  }, [cards, filters.cardIds, selectCard, selectedTable])

  const activeCard = cards.find((card) => card.id === filters.cardIds[0])
  const rows = useDashboardEntries(filters)
  const cardEntries = useMemo(
    () => rows.filter((row) => row.cardId === activeCard?.id && row.amount > 0),
    [activeCard?.id, rows],
  )
  const invoiceCycle = activeCard ? currentInvoiceCycle(activeCard) : undefined
  const invoiceEntries = useMemo(
    () => (invoiceCycle ? entriesInInvoice(cardEntries, invoiceCycle) : []),
    [cardEntries, invoiceCycle],
  )
  const invoiceTotal = invoiceEntries.reduce((total, row) => total + row.amount, 0)
  const invoiceCategories = useMemo(
    () => groupByKey(invoiceEntries, 'category', 'amount').map((group) => ({ key: group.label, label: group.label, value: group.value })),
    [invoiceEntries],
  )
  const monthlyInvoices = useMemo(() => spendingByMonth(cardEntries), [cardEntries])
  const threeMonthAverage = monthlyInvoices.length > 0
    ? monthlyInvoices.slice(-3).reduce((total, month) => total + month.amount, 0) / Math.min(monthlyInvoices.length, 3)
    : 0
  const installments = useMemo(() => openInstallments(cardEntries), [cardEntries])
  const largestInvoiceEntries = useMemo(() => [...invoiceEntries].sort((a, b) => b.amount - a.amount).slice(0, 5), [invoiceEntries])

  function handleSelectCard(id: number | null) {
    // This is a card-detail screen, so keep one active card even if "All cards" is
    // selected from the shared dropdown. The summary metadata only has meaning for
    // a concrete card.
    selectCard(id ?? cards[0]?.id ?? null)
    selectTable(null)
  }

  function handleSelectTable(id: number | null) {
    selectTable(id)
    const table = tableDefs.find((candidate) => candidate.id === id)
    selectCard(table?.cardId ?? null)
  }

  function handleSelectAccount(id: number | null) {
    selectAccount(id)
    selectTable(null)
    if (id !== null) selectCard(cards.find((card) => card.accountId === id)?.id ?? null)
  }

  return (
    <div className="flex h-full flex-col">
      <FilterBar
        filters={filters}
        setPreset={setPreset}
        setCustomFrom={setCustomFrom}
        setCustomTo={setCustomTo}
        selectAccount={handleSelectAccount}
        selectTable={handleSelectTable}
        selectCard={handleSelectCard}
        toggleCategory={toggleCategory}
        clearCategories={clearCategories}
        show={{ accounts: true, tables: true, cards: true, categories: false }}
        tableKinds={['cardLedger']}
      />
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {!activeCard ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('finances:cards.noCards')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <CardSummaryTile label={t('finances:cards.currentInvoice')} value={currency.format(invoiceTotal)} />
              <LimitSummaryTile limit={activeCard.limit} used={invoiceTotal} />
              <DatesSummaryTile cycle={invoiceCycle!} />
              <CardSummaryTile
                label={t('finances:cards.averageThreeMonths')}
                value={currency.format(threeMonthAverage)}
                sparkline={monthlyInvoices.slice(-3).map((month) => month.amount)}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              <DashboardCard title={t('finances:cards.invoicesByMonth')} className="h-[320px] lg:col-span-2" bodyClassName="p-2">
                {monthlyInvoices.length === 0 ? (
                  <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:cards.noEntries')}</p>
                ) : (
                  <AppBarChart
                    data={monthlyInvoices}
                    xKey="month"
                    series={{ key: 'amount', label: t('finances:cards.currentInvoice'), color: DOMAIN_COLOR.cards }}
                    xFormatter={formatMonthLabel}
                    valueFormatter={(value) => currency.format(value)}
                  />
                )}
              </DashboardCard>

              <DashboardCard title={t('finances:cards.invoiceComposition')} className="h-[320px]">
                <RankedBarList
                  items={invoiceCategories}
                  valueFormatter={(value) => currency.format(value)}
                  emptyLabel={t('finances:cards.noInvoiceEntries')}
                />
              </DashboardCard>
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <DashboardCard title={t('finances:cards.openInstallments')} className="h-[260px]" bodyClassName="overflow-auto p-0">
                {installments.length === 0 ? (
                  <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:cards.noInstallments')}</p>
                ) : (
                  <div className="divide-y">
                    {installments.map((installment) => (
                      <div key={`${installment.description}-${installment.currentInstallment}`} className="flex items-center justify-between gap-3 p-3 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={installment.description}>{installment.description}</p>
                          <p className="text-muted-foreground">
                            {t('finances:cards.installmentProgress', { current: installment.currentInstallment, total: installment.totalInstallments })}
                            {' · '}
                            {t('finances:cards.monthsLeft', { count: installment.monthsLeft })}
                          </p>
                        </div>
                        <span className="shrink-0 text-right tabular-nums">{currency.format(installment.remainingAmount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>

              <DashboardCard title={t('finances:cards.largestInvoiceEntries')} className="h-[260px]" bodyClassName="overflow-auto p-0">
                {largestInvoiceEntries.length === 0 ? (
                  <p className="text-muted-foreground flex h-full items-center justify-center text-xs">{t('finances:cards.noInvoiceEntries')}</p>
                ) : (
                  <div className="divide-y">
                    {largestInvoiceEntries.map((entry) => (
                      <div key={`${entry.tableId}-${entry.date}-${entry.description}`} className="flex items-center justify-between gap-3 p-3 text-xs">
                        <div className="min-w-0">
                          <p className="truncate font-medium" title={entry.description}>{entry.description || entry.category}</p>
                          <CategoryPill label={entry.category} />
                        </div>
                        <span className="shrink-0 tabular-nums">{currency.format(entry.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </DashboardCard>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  function LimitSummaryTile({ limit, used }: { limit?: number; used: number }) {
    const hasLimit = typeof limit === 'number' && limit > 0
    const percent = hasLimit ? Math.min(100, (used / limit) * 100) : 0
    const available = hasLimit ? limit - used : 0
    return (
      <div className="bg-card flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">{t('finances:cards.limit')}</p>
        {hasLimit ? (
          <>
            <p className="text-lg font-semibold tabular-nums">{currency.format(limit)}</p>
            <div className="bg-muted h-2 overflow-hidden rounded-full">
              <div
                className="entity-fill h-full rounded-full"
                style={{ width: `${percent}%`, '--entity-light': DOMAIN_COLOR.cards.light, '--entity-dark': DOMAIN_COLOR.cards.dark } as CSSProperties}
              />
            </div>
            <p className="text-muted-foreground text-xs tabular-nums">{t('finances:cards.available', { value: currency.format(available) })}</p>
          </>
        ) : (
          <p className="text-muted-foreground text-sm">{t('finances:cards.noLimit')}</p>
        )}
      </div>
    )
  }

  function DatesSummaryTile({ cycle }: { cycle: ReturnType<typeof currentInvoiceCycle> }) {
    return (
      <div className="bg-card flex flex-col gap-2 rounded-lg border p-3">
        <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">{t('finances:cards.dates')}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">{t('finances:cards.closes')}</p>
            <p className="font-medium">{formatDateLabel(cycle.closingDate)}</p>
            <p className="text-muted-foreground">{t('finances:cards.inDays', { count: daysUntil(cycle.closingDate) })}</p>
          </div>
          <div>
            <p className="text-muted-foreground">{t('finances:cards.due')}</p>
            <p className="font-medium">{cycle.dueDate ? formatDateLabel(cycle.dueDate) : '—'}</p>
            {cycle.dueDate && <p className="text-muted-foreground">{t('finances:cards.inDays', { count: daysUntil(cycle.dueDate) })}</p>}
          </div>
        </div>
      </div>
    )
  }
}

function CardSummaryTile({ label, value, sparkline }: { label: string; value: string; sparkline?: number[] }) {
  return <StatTile label={label} value={value} indicatorColor={DOMAIN_COLOR.cards.light} sparkline={sparkline} />
}
