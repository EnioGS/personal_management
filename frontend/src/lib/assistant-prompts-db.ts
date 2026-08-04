import Dexie, { type EntityTable } from 'dexie'
import type { EncryptedRow } from '@/lib/secure-store/create-encrypted-table'

const db = new Dexie('assistant-prompts-db') as Dexie & { rows: EntityTable<EncryptedRow, 'id'> }
db.version(1).stores({ rows: '++id, createdAt' })

export const assistantPromptsTable = db.rows
