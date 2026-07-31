import Dexie, { type EntityTable } from 'dexie'
import type { EncryptedRow } from '@/lib/secure-store/create-encrypted-table'

const db = new Dexie('app-secure-db') as Dexie & {
  notes: EntityTable<EncryptedRow, 'id'>
}

db.version(1).stores({
  notes: '++id, createdAt',
})

export const notesTable = db.notes
