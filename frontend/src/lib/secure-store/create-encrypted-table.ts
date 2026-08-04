import type { EntityTable } from 'dexie'
import { decryptJson, encryptJson } from '../crypto/envelope'

export interface EncryptedRow {
  id: number
  createdAt: number
  salt: string
  iv: string
  ciphertext: string
}

export type DecryptedRow<T> = T & { id: number; createdAt: number }

/**
 * Generalizes the notes section's encrypt/decrypt/CRUD pattern (see
 * sections/notes/secure-db.ts) for any JSON-serializable record type,
 * against a caller-supplied Dexie table.
 */
export function createEncryptedTable<T>(table: EntityTable<EncryptedRow, 'id'>) {
  async function add(passphrase: string, value: T): Promise<number> {
    const envelope = await encryptJson(passphrase, value)
    return table.add({ createdAt: Date.now(), ...envelope })
  }

  async function bulkAdd(passphrase: string, values: T[]): Promise<number[]> {
    const rows = await Promise.all(
      values.map(async (value) => ({ createdAt: Date.now(), ...(await encryptJson(passphrase, value)) })),
    )
    return table.bulkAdd(rows, { allKeys: true })
  }

  /** Returns null for entries that fail to decrypt (wrong passphrase) instead of throwing. */
  async function list(passphrase: string): Promise<(DecryptedRow<T> | null)[]> {
    const rows = await table.orderBy('createdAt').reverse().toArray()
    return Promise.all(
      rows.map(async (row) => {
        try {
          const value = await decryptJson<T>(passphrase, row)
          return { id: row.id, createdAt: row.createdAt, ...value }
        } catch {
          return null
        }
      }),
    )
  }

  /** In-place edit — preserves the row's original createdAt, unlike delete-then-add. */
  async function update(passphrase: string, id: number, value: T): Promise<void> {
    const envelope = await encryptJson(passphrase, value)
    await table.update(id, envelope)
  }

  async function remove(id: number): Promise<void> {
    await table.delete(id)
  }

  async function removeMany(ids: number[]): Promise<void> {
    await table.bulkDelete(ids)
  }

  return { add, bulkAdd, list, remove, removeMany, update }
}
