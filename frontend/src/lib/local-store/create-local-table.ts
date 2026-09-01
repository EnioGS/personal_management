import type { EntityTable } from 'dexie'

/** One stored record: the value as plain JSON, alongside its id/createdAt metadata. */
export interface LocalRow {
  id: number
  createdAt: number
  data: unknown
}

export type StoredRow<T> = T & { id: number; createdAt: number }

/**
 * CRUD over a caller-supplied Dexie table for any JSON-serializable record type.
 * Rows are stored as-is — no encryption, no passphrase (see adr/0019): the data
 * never leaves the browser, and the user backs it up from Vault → Get Started.
 */
export function createLocalTable<T>(table: EntityTable<LocalRow, 'id'>) {
  async function add(value: T): Promise<number> {
    return table.add({ createdAt: Date.now(), data: value })
  }

  async function bulkAdd(values: T[]): Promise<number[]> {
    const now = Date.now()
    return table.bulkAdd(
      values.map((value) => ({ createdAt: now, data: value })),
      { allKeys: true },
    )
  }

  /**
   * Newest first. Rows left over from the pre-plaintext schema (no `data` field)
   * are skipped rather than surfaced as empty records.
   */
  async function list(): Promise<StoredRow<T>[]> {
    const rows = await table.orderBy('createdAt').reverse().toArray()
    return rows
      .filter((row) => row.data !== undefined && row.data !== null)
      .map((row) => ({ id: row.id, createdAt: row.createdAt, ...(row.data as T) }))
  }

  /** In-place edit — preserves the row's original createdAt, unlike delete-then-add. */
  async function update(id: number, value: T): Promise<void> {
    await table.update(id, { data: value })
  }

  async function remove(id: number): Promise<void> {
    await table.delete(id)
  }

  async function removeMany(ids: number[]): Promise<void> {
    await table.bulkDelete(ids)
  }

  return { add, bulkAdd, list, remove, removeMany, update }
}
