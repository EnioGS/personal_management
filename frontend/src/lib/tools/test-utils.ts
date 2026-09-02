import { clearLocalStores } from '@/lib/local-store/test-utils'
import { useEntriesStore, useTableDefsStore } from '@/lib/model/model-stores'
import type { InvestmentClass, TableKind } from '@/lib/model/types'

/** Creates a table definition for the tool tests and returns its id as a tool "table" key. */
export async function seedTable(kind: TableKind, name = 'Test table', investmentClass?: InvestmentClass): Promise<string> {
  const id = await useTableDefsStore.getState().addItem({ name, kind, ...(investmentClass ? { investmentClass } : {}) })
  return String(id)
}

/** Clears every table def and every entry — the tool tests' equivalent of clearLocalStores. */
export async function clearTables(): Promise<void> {
  await clearLocalStores(useTableDefsStore, useEntriesStore)
}
