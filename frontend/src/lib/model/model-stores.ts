import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import {
  accountsTable,
  allocationTargetsTable,
  budgetsTable,
  cardsTable,
  categoriesTable,
  entryLabelsTable,
  entriesTable,
  ingestionAuditEventsTable,
  labelRulesTable,
  ingestionColumnMappingsTable,
  ingestionRowsTable,
  ingestionSourcesTable,
  tableDefsTable,
} from './model-db'
import type {
  Account,
  AllocationTarget,
  Budget,
  Card,
  Category,
  Entry,
  EntryLabels,
  IngestionAuditEvent,
  IngestionColumnMapping,
  IngestionRow,
  LabelRule,
  IngestionSource,
  TableDef,
} from './types'

export const useAccountsStore = createLocalListStore<Account>(accountsTable)
export const useCardsStore = createLocalListStore<Card>(cardsTable)
export const useTableDefsStore = createLocalListStore<TableDef>(tableDefsTable)
export const useCategoriesStore = createLocalListStore<Category>(categoriesTable)
export const useBudgetsStore = createLocalListStore<Budget>(budgetsTable)
export const useAllocationTargetsStore = createLocalListStore<AllocationTarget>(allocationTargetsTable)
export const useIngestionSourcesStore = createLocalListStore<IngestionSource>(ingestionSourcesTable)
export const useIngestionColumnMappingsStore = createLocalListStore<IngestionColumnMapping>(ingestionColumnMappingsTable)
export const useIngestionRowsStore = createLocalListStore<IngestionRow>(ingestionRowsTable)
export const useLabelRulesStore = createLocalListStore<LabelRule>(labelRulesTable)
export const useEntryLabelsStore = createLocalListStore<EntryLabels>(entryLabelsTable)
export const useIngestionAuditEventsStore = createLocalListStore<IngestionAuditEvent>(ingestionAuditEventsTable)

/**
 * Every user table's rows, in one store. Consumers filter by `tableId` — see
 * `entriesForTable`. Loading the lot into memory matches how every other store in this
 * app already works, and keeps a table switch instant rather than a fresh query.
 */
export const useEntriesStore = createLocalListStore<Entry>(entriesTable)

/** The rows belonging to one table, newest first (the order the store already loads). */
export function entriesForTable(entries: StoredRow<Entry>[], tableId: number): StoredRow<Entry>[] {
  return entries.filter((entry) => entry.tableId === tableId)
}
