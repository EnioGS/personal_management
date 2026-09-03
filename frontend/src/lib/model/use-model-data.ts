import { useMemo } from 'react'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { useUiStore } from '@/store/ui-store'
import { entriesForTable, useEntriesStore, useEntryLabelsStore, useTableDefsStore } from './model-stores'
import type { Entry, InvestmentClass, TableKind } from './types'

/**
 * Rows whose ingestion labels the user has confirmed. Everything else is still in
 * the ingestion centre's worklist, so no chart may count it — this is the single
 * gate every analytics surface outside the Finances dashboard passes through.
 */
function useLabelledEntries(): StoredRow<Entry>[] {
  const entries = useEntriesStore((s) => s.items)
  const entryLabels = useEntryLabelsStore((s) => s.items)
  return useMemo(() => {
    const labelled = new Set(entryLabels.filter((labels) => labels.flowRole !== 'cancelled').map((labels) => labels.entryId))
    return entries.filter((entry) => labelled.has(entry.id))
  }, [entries, entryLabels])
}

/**
 * The rows of whichever table a workspace currently has selected.
 *
 * Falls back to the first available table when nothing is remembered, so a panel
 * always has one to read even before anything has been chosen.
 */
export function useActiveTableEntries(workspaceId: string, kinds: TableKind[], investmentClass?: InvestmentClass): StoredRow<Entry>[] {
  const tableDefs = useTableDefsStore((s) => s.items)
  const entries = useLabelledEntries()
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
  const entries = useLabelledEntries()
  const kindKey = kinds.join(',')

  return useMemo(() => {
    const wanted = new Set(kindKey.split(','))
    const ids = new Set(tableDefs.filter((def) => wanted.has(def.kind)).map((def) => def.id))
    return entries.filter((entry) => ids.has(entry.tableId))
  }, [tableDefs, entries, kindKey])
}
