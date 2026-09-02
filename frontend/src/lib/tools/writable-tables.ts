import type { StoredRow } from '@/lib/local-store/create-local-table'
import { entriesForTable, useEntriesStore, useTableDefsStore } from '@/lib/model/model-stores'
import { TABLE_KIND_SCHEMAS } from '@/lib/model/table-kinds'
import type { Entry } from '@/lib/model/types'
import type { TableSchema } from '@/lib/table-schema'

export interface WritableTable {
  /** The table definition's row id, as a string — how tools identify a table (a user-given
   * name isn't guaranteed unique, so it appears only in `label`, for the tool description). */
  key: string
  label: string
  schema: TableSchema<Entry>
  tableId: number
}

/**
 * Every user table the assistant can read/write, read fresh from tableDefs on every
 * call rather than built once. Tables are user data now (see lib/model/) — a table
 * created in the app mid-conversation must be visible to the very next tool call, so
 * this cannot be the fixed array of five stores it used to be.
 */
export function writableTables(): WritableTable[] {
  return useTableDefsStore.getState().items.map((def) => ({
    key: String(def.id),
    label: def.name,
    schema: TABLE_KIND_SCHEMAS[def.kind],
    tableId: def.id,
  }))
}

export function findWritableTable(key: string): WritableTable | undefined {
  return writableTables().find((t) => t.key === key)
}

/**
 * CRUD against the one shared entries store (lib/model/model-stores.ts), scoped to a
 * single table's rows — the closest equivalent of the per-table stores every tool file
 * used to call directly.
 */
export function itemsFor(tableId: number): StoredRow<Entry>[] {
  return entriesForTable(useEntriesStore.getState().items, tableId)
}

export async function addItemFor(tableId: number, value: Record<string, unknown>): Promise<number> {
  return useEntriesStore.getState().addItem({ ...value, tableId } as unknown as Entry)
}

export async function addItemsFor(tableId: number, values: Record<string, unknown>[]): Promise<void> {
  await useEntriesStore.getState().addItems(values.map((v) => ({ ...v, tableId }) as unknown as Entry))
}

export async function updateItemFor(id: number, tableId: number, value: Record<string, unknown>): Promise<void> {
  await useEntriesStore.getState().updateItem(id, { ...value, tableId } as unknown as Entry)
}
