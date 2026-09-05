import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { confirmedRowsTable, sourceRowsTable } from './model-db'
import { retireIfEmpty } from './source-files'
import type { ConfirmedRow, SourceRow } from './types'

export type MarkableTable = 'source' | 'confirmed'

function tableOf(table: MarkableTable) {
  return table === 'source' ? sourceRowsTable : confirmedRowsTable
}

/**
 * Marking a row for elimination, and unmarking it.
 *
 * One function for both, because they are one gesture: a mark hides the row from every
 * dashboard and leaves it in its table, so putting it on and taking it off are equally
 * safe and neither needs asking. The user and the assistant reach this same code.
 */
export async function setMarked(table: MarkableTable, rowIds: number[], marked: boolean): Promise<number> {
  const store = tableOf(table)
  let changed = 0
  for (const id of rowIds) {
    const stored = await store.get(id)
    if (!stored) continue
    await store.update(id, { data: { ...(stored.data as SourceRow | ConfirmedRow), markedForElimination: marked } })
    changed += 1
  }
  await refreshAllLocalStores()
  return changed
}

export async function toggleMark(table: MarkableTable, rowId: number): Promise<boolean> {
  const stored = await tableOf(table).get(rowId)
  if (!stored) return false
  const marked = !(stored.data as SourceRow).markedForElimination
  await setMarked(table, [rowId], marked)
  return marked
}

/**
 * Removing marked rows, permanently.
 *
 * The one thing the user can do that the assistant cannot, and the reason marking is
 * safe to hand out: nothing else in this app destroys data, so a mistaken mark costs a
 * click to undo while a mistaken deletion costs the row.
 */
export async function deleteMarked(table: MarkableTable, rowIds: number[]): Promise<number> {
  const store = tableOf(table)
  const marked: number[] = []
  const sources = new Set<number>()
  for (const id of rowIds) {
    const stored = await store.get(id)
    const row = stored?.data as SourceRow | undefined
    if (!row?.markedForElimination) continue
    marked.push(id)
    if (table === 'source') sources.add(row.sourceId)
  }
  await store.bulkDelete(marked)
  // A file whose last rows were deleted is as finished as one whose last rows were
  // confirmed: there is nothing left to work on, so the table goes.
  for (const sourceId of sources) await retireIfEmpty(sourceId)
  await refreshAllLocalStores()
  return marked.length
}
