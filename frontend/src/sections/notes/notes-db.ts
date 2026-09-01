import Dexie, { type EntityTable } from 'dexie'
import type { LocalRow } from '@/lib/local-store/create-local-table'

const db = new Dexie('app-secure-db') as Dexie & {
  notes: EntityTable<LocalRow, 'id'>
}

db.version(1).stores({
  notes: '++id, createdAt',
})

// v2 keeps the same indexes and only drops rows written by the old encrypted
// schema (salt/iv/ciphertext) — unreadable now that there is no passphrase.
db.version(2).stores({ notes: '++id, createdAt' }).upgrade((tx) => tx.table('notes').clear())

export const notesTable = db.notes
