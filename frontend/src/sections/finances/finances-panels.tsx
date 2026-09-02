import { useEffect, useMemo, useRef, type CSSProperties } from 'react'
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
import { useAccountsStore, useCardsStore, useEntriesStore, useEntryLabelsStore, useTableDefsStore } from '@/lib/model/model-stores'
import { averageCardSpendByCategory, categorySpendChanges, frequentDescriptions, outgoingSpending, spendingByMonth } from './spending-analytics'
import { currentInvoiceCycle, daysUntil, entriesInInvoice, openInstallments } from './card-analytics'
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

type CapitalMetric = 'capital' | 'fixedIncome' | 'variableIncome' | 'cardSpend'

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
  const { filters, setPreset, setCustomFrom, setCustomTo, selectAccount, selectTable, selectCard, toggleCategory, clearCategories } =
    useDashboardFilters()
  const rows = useDashboardEntries(filters)
  const selectedRange = useMemo(() => resolveFilterRange(filters), [filters])
  const accounts = useAccountsStore((s) => s.items).filter((a) => !a.archived)
  const tableDefs = useTableDefsStore((s) => s.items)
  const allEntries = useEntriesStore((s) => s.items)
  const entryLabels = useEntryLabelsStore((s) => s.items)

  // Capital must begin at the first matching entry, not at the start of the
  // selected window. The displayed points remain scoped to that window, while the
  // running total retains the complete prior history that establishes their value.
  const capitalHistoryFilters: DashboardFilters = useMemo(
    () => ({ ...filters, preset: 'custom', customFrom: '', customTo: '' }),
    [filters],
  )
  const capitalHistoryRows = useDashboardEntries(capitalHistoryFilters)
  const investmentHistory = useMemo<InvestmentValueEntry[]>(() => {
    const labelsByEntryId = new Map(entryLabels.map((labels) => [labels.entryId, labels]))
    const classByTableId = new Map(
      tableDefs
        .filter((table) => table.kind === 'investmentLedger' && table.investmentClass)
        .map((table) => [table.id, table.investmentClass]),
    )
    return allEntries.flatMap((entry) => {
      const labels = labelsByEntryId.get(entry.id)
      const investmentClass = classByTableId.get(entry.tableId)
      if (
        !labels?.financeDestinations.includes('investments') ||
        !investmentClass ||
        typeof entry.date !== 'number' ||
        typeof entry.asset !== 'string' ||
        (entry.type !== 'buy' && entry.type !== 'sell' && entry.type !== 'income') ||
        typeof entry.quantity !== 'number' ||
        typeof entry.price !== 'number'
      ) return []
      return [{
        date: entry.date,
        asset: entry.asset,
        type: entry.type,
        quantity: entry.quantity,
        price: entry.price,
        investmentClass,
        deleted: Boolean(entry.deleted),
      }]
    })
  }, [tableDefs, allEntries, entryLabels])
  const capitalData = useMemo(
    () => capitalEvolution(capitalHistoryRows, selectedRange, investmentHistory),
    [capitalHistoryRows, selectedRange, investmentHistory],
  )

  const comparisonLabel = t('finances:overview.startingPeriod')
  const currentCapital = useMemo(() => capitalMetric(capitalData, 'capital', 'up', comparisonLabel), [capitalData, comparisonLabel])
  const fixedIncome = useMemo(() => capitalMetric(capitalData, 'fixedIncome', 'up', comparisonLabel), [capitalData, comparisonLabel])
  const variableIncome = useMemo(() => capitalMetric(capitalData, 'variableIncome', 'up', comparisonLabel), [capitalData, comparisonLabel])
  const cardSpend = useMemo(() => capitalMetric(capitalData, 'cardSpend', 'down', comparisonLabel), [capitalData, comparisonLabel])

  const cardCategoryAverages = useMemo(
    () => averageCardSpendByCategory(rows, capitalData.map((point) => point.month)),
    [capitalData, rows],
  )

  const accountBalances = useMemo(() => {
    return accounts.map((account) => {
      const tableIds = new Set(
        tableDefs.filter((table) => table.kind === 'bankLedger' && table.accountId === account.id).map((table) => table.id),
      )
      const balance = capitalHistoryRows
        .filter((entry) => tableIds.has(entry.tableId) && entry.financeDestinations?.includes('movements'))
        .reduce((sum, entry) => sum + (entry.direction === 'in' ? entry.amount : -entry.amount), 0)
      return { key: String(account.id), label: account.name, value: balance }
    })
  }, [accounts, tableDefs, capitalHistoryRows])

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
      <div className="min-h-0 flex-1">
        <FinanceTableDrawer id="movements" kinds={['bankLedger', 'cardLedger', 'generic']}>
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
              label={t('common:dashboard.cardSpend')}
              value={currency.format(cardSpend.current)}
              indicatorColor={DIVERGING_PAIR.negative.light}
              delta={cardSpend.delta}
              sparkline={cardSpend.sparkline}
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
                  cardSpendLabel={t('common:dashboard.cardSpend')}
                  variableIncomeLabel={t('investments:items.variableIncome')}
                  fixedIncomeLabel={t('investments:items.fixedIncome')}
                />
              )}
            </DashboardCard>

            <DashboardCard title={t('finances:overview.spendingCategories')} className="h-[320px]">
              <RankedBarList
                items={cardCategoryAverages}
                valueFormatter={(v) => currency.format(v)}
                emptyLabel={t('finances:spending.noSpending')}
                variant="underlined"
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
        </FinanceTableDrawer>
      </div>
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
      <div className="min-h-0 flex-1">
        <FinanceTableDrawer id="spending" kinds={['bankLedger', 'cardLedger', 'generic']}>
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

          {/* Card detail now lives with spending rather than as a separate Finance item. */}
          <CardsPanel
            filters={filters}
            controls={{ setPreset, setCustomFrom, setCustomTo, selectAccount, selectTable, selectCard, toggleCategory, clearCategories }}
            showFilter={false}
            initializeCard={false}
          />
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

type DashboardFilterControls = Pick<
  ReturnType<typeof useDashboardFilters>,
  'setPreset' | 'setCustomFrom' | 'setCustomTo' | 'selectAccount' | 'selectTable' | 'selectCard' | 'toggleCategory' | 'clearCategories'
>

/** Credit-card detail now shares Spending's context whenever embedded there. */
export function CardsPanel({
  filters: suppliedFilters,
  controls,
  showFilter = true,
  initializeCard = true,
}: {
  filters?: DashboardFilters
  controls?: DashboardFilterControls
  showFilter?: boolean
  initializeCard?: boolean
} = {}) {
  const { t } = useTranslation(['finances', 'common'])
  const localControls = useDashboardFilters()
  const filters = suppliedFilters ?? localControls.filters
  const { setPreset, setCustomFrom, setCustomTo, selectAccount, selectTable, selectCard, toggleCategory, clearCategories } = controls ?? localControls
  const cards = useCardsStore((s) => s.items).filter((card) => !card.archived)
  const tableDefs = useTableDefsStore((s) => s.items)
  const hasInitializedCard = useRef(false)
  const selectedTable = tableDefs.find((table) => table.id === filters.tableIds[0] && table.kind === 'cardLedger')

  useEffect(() => {
    if (!initializeCard || hasInitializedCard.current || cards.length === 0) return
    const cardId = filters.cardIds[0] ?? selectedTable?.cardId ?? cards[0].id
    selectCard(cardId)
    hasInitializedCard.current = true
  }, [cards, filters.cardIds, initializeCard, selectCard, selectedTable])

  const activeCard = cards.find((card) => card.id === filters.cardIds[0]) ?? cards[0]
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
    <div className="flex flex-col border-t pt-3">
      {showFilter && <FilterBar
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
      />}
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
