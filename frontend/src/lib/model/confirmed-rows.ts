import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { confirmedRowsTable } from './model-db'
import type { ConfirmedRow } from './types'

/**
 * Setting the meaning of a row that is already in a table.
 *
 * Category and subcategory are the two labels a row may be given *later* — a row can be
 * confirmed knowing only where it belongs, and be given its meaning afterwards. That is
 * why this is an ordinary edit rather than the add-and-mark discipline corrections use:
 * nothing about the row's lineage changes, only what it is called. Where a row belongs,
 * what it moved, and when, are all lineage, and those are still corrected by adding a
 * row with the same `row_id` and marking the old one.
 */
export async function setConfirmedMeaning(rowId: number, meaning: Partial<Pick<ConfirmedRow, 'category' | 'subcategory'>>): Promise<void> {
  const stored = await confirmedRowsTable.get(rowId)
  if (!stored) throw new Error(`Confirmed row ${rowId} was not found.`)
  await confirmedRowsTable.update(rowId, { data: { ...(stored.data as ConfirmedRow), ...meaning } })
  await refreshAllLocalStores()
}
