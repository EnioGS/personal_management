import { useMemo } from 'react'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { createCategoryResolver } from '@/lib/model/category-resolver'
import { useAccountsStore, useCardsStore, useCategoriesStore, useCategoryRulesStore, useEntriesStore, useEntryLabelsStore, useTableDefsStore } from '@/lib/model/model-stores'
import { categoryColumnFor } from '@/lib/model/table-kinds'
import type { Account, Card, Category, CategoryRule, Entry, EntryLabels, FinanceDestination, RecurrenceLabel, SpendingTreatment, TableDef, TableKind } from '@/lib/model/types'
import { isWithinRange } from '@/lib/dashboard/date-range'
import { resolveFilterRange, type DashboardFilters } from './dashboard-filters'

/** Every kind that represents money moving — the scope of the Finances dashboard. */
export const MONEY_KINDS: TableKind[] = ['bankLedger', 'generic', 'cardLedger']

export interface FilteredEntry {
  tableId: number
  date: number
  amount: number
  /** Real for bankLedger; generic/cardLedger spend has no direction field, so it counts as 'out'. */
  direction: 'in' | 'out'
  category: string
  /** bankLedger/cardLedger's own free-text description, or generic's note — whichever the kind has. */
  description: string
  accountId?: number
  accountName?: string
  cardId?: number
  /** Present only when a row has passed through Data ingestion centre. */
  labelled?: boolean
  financeDestinations?: FinanceDestination[]
  spendingTreatment?: SpendingTreatment
  recurrence?: RecurrenceLabel
}

interface FilterMoneyEntriesParams {
  entries: StoredRow<Entry>[]
  tableDefs: StoredRow<TableDef>[]
  accounts: StoredRow<Account>[]
  cards?: StoredRow<Card>[]
  categories: StoredRow<Category>[]
  rules: StoredRow<CategoryRule>[]
  entryLabels?: StoredRow<EntryLabels>[]
  filters: DashboardFilters
}

/**
 * Applies every FilterBar dimension at once (date range, account, card, category) —
 * pulled out of the hook below so the filtering logic itself is plain, synchronous,
 * and testable without rendering anything.
 */
export function filterMoneyEntries({
  entries,
  tableDefs,
  accounts,
  cards = [],
  categories,
  rules,
  entryLabels = [],
  filters,
}: FilterMoneyEntriesParams): FilteredEntry[] {
  const range = resolveFilterRange(filters)
  const accountsById = new Map(accounts.map((a) => [a.id, a]))
  const cardsById = new Map(cards.map((card) => [card.id, card]))
  const labelsByEntryId = new Map(entryLabels.map((labels) => [labels.entryId, labels]))
  const tablesById = new Map(tableDefs.filter((t) => MONEY_KINDS.includes(t.kind)).map((t) => [t.id, t]))

  // One resolver per table kind actually present, not per entry — category rules can
  // be scope-restricted per kind, so a single shared resolver would apply them wrong.
  const resolvers = new Map<TableKind, ReturnType<typeof createCategoryResolver>>()
  function resolverFor(kind: TableKind) {
    let resolver = resolvers.get(kind)
    if (!resolver) {
      resolver = createCategoryResolver(categories, rules, kind)
      resolvers.set(kind, resolver)
    }
    return resolver
  }

  const result: FilteredEntry[] = []
  for (const entry of entries) {
    if (entry.deleted) continue
    const table = tablesById.get(entry.tableId)
    if (!table) continue
    const accountId = table.accountId ?? (table.cardId ? cardsById.get(table.cardId)?.accountId : undefined)
    if (filters.tableIds.length > 0 && !filters.tableIds.includes(table.id)) continue
    if (filters.accountIds.length > 0 && (!accountId || !filters.accountIds.includes(accountId))) continue
    if (filters.cardIds.length > 0 && (!table.cardId || !filters.cardIds.includes(table.cardId))) continue

    const date = typeof entry.date === 'number' ? entry.date : null
    if (date === null || !isWithinRange(date, range)) continue

    const column = categoryColumnFor(table.kind)
    const rawCategory = column ? entry[column] : undefined
    const resolved = resolverFor(table.kind)(rawCategory)
    const labels = labelsByEntryId.get(entry.id)
    const labelledCategory = labels?.categoryId ? categories.find((category) => category.id === labels.categoryId)?.name : undefined
    const category = labelledCategory ?? resolved.label
    if (filters.categories.length > 0 && !filters.categories.includes(category)) continue

    result.push({
      tableId: table.id,
      date,
      amount: typeof entry.amount === 'number' ? entry.amount : 0,
      direction: labels?.flowRole === 'inflow' ? 'in' : labels ? 'out' : table.kind === 'bankLedger' && entry.direction === 'in' ? 'in' : 'out',
      category,
      description: String(entry.description ?? entry.note ?? ''),
      accountId,
      accountName: accountId ? accountsById.get(accountId)?.name : undefined,
      cardId: table.cardId,
      labelled: Boolean(labels),
      financeDestinations: labels?.financeDestinations,
      spendingTreatment: labels?.spendingTreatment,
      recurrence: labels?.recurrence,
    })
  }
  return result
}

/** Reactive wrapper around filterMoneyEntries — see that function for the actual logic. */
export function useDashboardEntries(filters: DashboardFilters): FilteredEntry[] {
  const tableDefs = useTableDefsStore((s) => s.items)
  const entries = useEntriesStore((s) => s.items)
  const accounts = useAccountsStore((s) => s.items)
  const cards = useCardsStore((s) => s.items)
  const categories = useCategoriesStore((s) => s.items)
  const rules = useCategoryRulesStore((s) => s.items)
  const entryLabels = useEntryLabelsStore((s) => s.items)

  return useMemo(
    () => filterMoneyEntries({ entries, tableDefs, accounts, cards, categories, rules, entryLabels, filters }),
    [entries, tableDefs, accounts, cards, categories, rules, entryLabels, filters],
  )
}
