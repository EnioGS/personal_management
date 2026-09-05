import Dexie, { type EntityTable } from 'dexie'
import type { LocalRow } from '@/lib/local-store/create-local-table'

/**
 * Chat history, in a database of its own.
 *
 * It is not part of the finance model and does not belong in its schema, but it is the
 * user's data all the same: it is saved as it happens, comes back on reload, and travels
 * in the export like everything else here.
 */
const db = new Dexie('app-chat-db') as Dexie & {
  conversations: EntityTable<LocalRow, 'id'>
}

db.version(1).stores({ conversations: '++id, createdAt' })

export const conversationsTable = db.conversations
