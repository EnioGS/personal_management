import Dexie, { type EntityTable } from 'dexie'
import type { LocalRow } from '@/lib/local-store/create-local-table'

const db = new Dexie('assistant-config-db') as Dexie & { rows: EntityTable<LocalRow, 'id'> }
db.version(1).stores({ rows: '++id, createdAt' })

// v2 keeps the same indexes and only drops rows written by the old encrypted
// schema (salt/iv/ciphertext) — unreadable now that there is no passphrase.
db.version(2).stores({ rows: '++id, createdAt' }).upgrade((tx) => tx.table('rows').clear())

// v3: the single `{ key: 'default', apiKey, model }` row becomes one row per
// provider/connection (adr/0027). Any pre-existing row was necessarily an
// OpenRouter key (the only provider that existed before), so it's backfilled
// in place — `provider`/`isActive` added, the now-unused `key` dropped —
// rather than cleared, preserving whatever key the user already saved.
db.version(3)
  .stores({ rows: '++id, createdAt' })
  .upgrade((tx) =>
    tx
      .table('rows')
      .toCollection()
      .modify((row: { data?: Record<string, unknown> }) => {
        const data = row.data
        if (data && typeof data === 'object' && !('provider' in data)) {
          delete data.key
          data.provider = 'openrouter'
          data.isActive = true
        }
      }),
  )

export const assistantConfigTable = db.rows
