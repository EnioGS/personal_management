import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { parseDateValue } from '@/lib/parse-date'
import { parseNumberValue } from '@/lib/parse-number'
import { DEFAULT_MEANING } from './ingestion'
import { SOURCE_FILENAME_KEY } from './observations'
import { confirmedRowsTable } from './model-db'
import { newRowId } from './row-id'
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

/**
 * Adds a row straight to a confirmed table.
 *
 * For something that was never in any file: a cash payment, a transfer nobody exported.
 * It is a new row, so it mints a new id rather than borrowing one — an id is shared only
 * between copies of the same row and between a correction and what it corrects.
 */
export async function addConfirmedRow(section: string, screen: string): Promise<number> {
  const now = Date.now()
  return confirmedRowsTable.add({
    createdAt: now,
    data: {
      rowId: newRowId({ section, screen, addedAt: now }),
      section,
      screen,
      confirmedAt: now,
      // Provenance goes where every row's provenance goes: into the condensed column.
      observations: JSON.stringify({ [SOURCE_FILENAME_KEY]: 'added by hand' }),
      category: DEFAULT_MEANING,
      subcategory: DEFAULT_MEANING,
    } satisfies ConfirmedRow,
  })
}

/** The cells a person may edit in a confirmed table, and how each reads what was typed. */
export const CONFIRMED_EDITABLE = ['date', 'amount', 'category', 'subcategory', 'account', 'card', 'observations'] as const
export type ConfirmedEditableColumn = (typeof CONFIRMED_EDITABLE)[number]

/**
 * Edits one cell of a confirmed row.
 *
 * This is the user's own hand on their own data, so it writes what they typed — dates
 * read day-first and amounts read with either decimal mark, the same way an import reads
 * them. The assistant does not have this: it corrects by adding a row with the same
 * `row_id` and marking the old one, so a change it makes is always visible as a pair.
 */
export async function updateConfirmedRow(rowId: number, column: ConfirmedEditableColumn, value: string): Promise<void> {
  const stored = await confirmedRowsTable.get(rowId)
  if (!stored) throw new Error(`Confirmed row ${rowId} was not found.`)
  const row = stored.data as ConfirmedRow

  const patch: Partial<ConfirmedRow> =
    column === 'date' ? { date: parseDateValue(value) ?? undefined }
    : column === 'amount' ? { amount: parseNumberValue(value) ?? undefined }
    : column === 'observations' ? { observations: value }
    // An account or a card can genuinely be nothing — not every row has one — while a
    // category emptied out means "nobody has said", which is what `outros` is for.
    : column === 'account' || column === 'card' ? { [column]: value.trim() || undefined }
    : { [column]: value.trim() || DEFAULT_MEANING }

  await confirmedRowsTable.update(rowId, { data: { ...row, ...patch } })
  await refreshAllLocalStores()
}

/**
 * Moves a confirmed row to another table, or puts a second copy of it there.
 *
 * Which table a row is in *is* its section and screen — there is no separate address —
 * so changing them is how a row is re-placed. Moving corrects a placement that was
 * wrong; copying says the row belongs in both, which is what confirming a row labelled
 * with two screens does in the first place. Either way the `row_id` is kept: it is what
 * ties every copy of one transaction together, and what stops anything counting it twice.
 */
export async function placeConfirmedRow(
  rowId: number,
  placement: { section: string; screen: string },
  mode: 'move' | 'copy' = 'move',
): Promise<void> {
  const stored = await confirmedRowsTable.get(rowId)
  if (!stored) throw new Error(`Confirmed row ${rowId} was not found.`)
  const row = stored.data as ConfirmedRow

  if (mode === 'copy') await confirmedRowsTable.add({ createdAt: Date.now(), data: { ...row, ...placement } })
  else await confirmedRowsTable.update(rowId, { data: { ...row, ...placement } })
  await refreshAllLocalStores()
}
