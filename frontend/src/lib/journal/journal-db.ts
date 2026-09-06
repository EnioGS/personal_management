import Dexie, { type EntityTable } from 'dexie'
import type { LocalRow } from '@/lib/local-store/create-local-table'

/**
 * The undo log, in a database of its own.
 *
 * Apart from the data it describes, deliberately: wiping the vault should not take with
 * it the record of what was wiped, and a journal that lives inside the thing it protects
 * protects nothing. It is also the reason this is a journal rather than a mirrored
 * database — one source of truth, and a log derived from it, cannot drift apart.
 */
const db = new Dexie('app-journal-db') as Dexie & {
  entries: EntityTable<LocalRow, 'id'>
}

db.version(1).stores({ entries: '++id, createdAt' })

export const journalEntriesTable = db.entries
