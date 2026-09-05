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
  usageTotals: EntityTable<LocalRow, 'id'>
  assistantProfiles: EntityTable<LocalRow, 'id'>
  profileUsage: EntityTable<LocalRow, 'id'>
}

db.version(1).stores({ conversations: '++id, createdAt' })

/**
 * What every request has cost, kept apart from the conversations.
 *
 * A conversation carries its own usage, but deleting one would take the record of what it
 * spent with it — and money spent is not undone by deleting the evidence. This is the
 * running total since the beginning, which nothing but wiping the vault resets.
 */
db.version(2).stores({ usageTotals: '++id, createdAt' })

/**
 * A saved set of everything the assistant is told.
 *
 * One profile is every prompt text at once — the system prompt, the ingestion guide, each
 * tool's description — so two wordings can be run against the same data and compared by
 * what they cost and how far they got. The default is not stored: it lives in the code,
 * and a profile holds only what it says differently.
 */
db.version(3).stores({ assistantProfiles: '++id, createdAt' })

/**
 * Usage was one row for the whole app; it becomes one row per profile.
 *
 * A profile is worth having only if what it costs can be told apart from what another
 * costs, so the running total is split by the profile that was active when it was spent.
 * What was spent before profiles existed belongs to the default, which is where it was.
 */
db.version(4).stores({}).upgrade(async (tx) => {
  await tx.table('usageTotals').toCollection().modify((row: { data?: Record<string, unknown> }) => {
    if (row.data && !row.data.profile) row.data.profile = 'Default'
  })
})

/**
 * What each profile has spent, kept apart from what the app has spent altogether.
 *
 * Two questions that look alike and are not: the chat's own line is the lifetime bill,
 * which nothing but wiping the vault should reset, while these are measurements taken to
 * compare one wording against another — and an experiment one is done with is meant to be
 * cleared. Separate tables, so clearing one leaves the other alone.
 */
db.version(5).stores({ profileUsage: '++id, createdAt' })

export const conversationsTable = db.conversations
export const usageTotalsTable = db.usageTotals
export const assistantProfilesTable = db.assistantProfiles
export const profileUsageTable = db.profileUsage
