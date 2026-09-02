import { useMemo } from 'react'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { useUiStore } from '@/store/ui-store'
import { entriesForTable, useEntriesStore, useTableDefsStore } from './model-stores'
import type { Entry, InvestmentClass, TableKind } from './types'

/**
 * The rows of whichever table a workspace currently has selected.
 *
 * Mirrors the fallback in TableWorkspace — first available table when nothing is
 * remembered — so a panel's chart and its table always show the same table, without
 * the selection having to be lifted into a shared parent.
 */
export function useActiveTableEntries(workspaceId: string, kinds: TableKind[], investmentClass?: InvestmentClass): StoredRow<Entry>[] {
  const tableDefs = useTableDefsStore((s) => s.items)
  const entries = useEntriesStore((s) => s.items)
  const remembered = useUiStore((s) => s.activeTableByWorkspace[workspaceId])
  // Call sites pass an inline array literal, so compare by contents, not identity.
  const kindKey = kinds.join(',')

  return useMemo(() => {
    const wanted = new Set(kindKey.split(','))
    const available = tableDefs.filter((def) => wanted.has(def.kind) && (!investmentClass || def.investmentClass === investmentClass))
    const active = available.find((def) => def.id === remembered) ?? available[0]
    return active ? entriesForTable(entries, active.id) : []
  }, [tableDefs, entries, remembered, kindKey, investmentClass])
}

/** Every row across every table of the given kinds — for rollups that span tables. */
export function useEntriesOfKinds(kinds: TableKind[]): StoredRow<Entry>[] {
  const tableDefs = useTableDefsStore((s) => s.items)
  const entries = useEntriesStore((s) => s.items)
  const kindKey = kinds.join(',')

  return useMemo(() => {
    const wanted = new Set(kindKey.split(','))
    const ids = new Set(tableDefs.filter((def) => wanted.has(def.kind)).map((def) => def.id))
    return entries.filter((entry) => ids.has(entry.tableId))
  }, [tableDefs, entries, kindKey])
}
