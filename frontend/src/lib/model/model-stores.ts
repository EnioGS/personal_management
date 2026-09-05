import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import {
  accountsTable,
  allocationTargetsTable,
  budgetsTable,
  cardsTable,
  classificationNotesTable,
  ingestionAuditEventsTable,
  labelRulesTable,
  sourceFilesTable,
  sourceRowsTable,
  confirmedRowsTable,
} from './model-db'
import type {
  Account,
  AllocationTarget,
  Budget,
  Card,
  ClassificationNote,
  IngestionAuditEvent,
  LabelRule,
  SourceFile,
  SourceRow,
  ConfirmedRow,
} from './types'

export const useAccountsStore = createLocalListStore<Account>(accountsTable)
export const useCardsStore = createLocalListStore<Card>(cardsTable)
export const useBudgetsStore = createLocalListStore<Budget>(budgetsTable)
export const useAllocationTargetsStore = createLocalListStore<AllocationTarget>(allocationTargetsTable)
export const useLabelRulesStore = createLocalListStore<LabelRule>(labelRulesTable)
export const useClassificationNotesStore = createLocalListStore<ClassificationNote>(classificationNotesTable)
export const useIngestionAuditEventsStore = createLocalListStore<IngestionAuditEvent>(ingestionAuditEventsTable)

export const useSourceFilesStore = createLocalListStore<SourceFile>(sourceFilesTable)
export const useSourceRowsStore = createLocalListStore<SourceRow>(sourceRowsTable)
export const useConfirmedRowsStore = createLocalListStore<ConfirmedRow>(confirmedRowsTable)
