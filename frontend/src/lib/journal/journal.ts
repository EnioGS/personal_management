import { journalEntriesTable } from './journal-db'
import type { LocalRow } from '@/lib/local-store/create-local-table'

export type JournalOp = 'insert' | 'update' | 'delete'

export interface JournalEntry {
  /** Everything one assistant message, or one action of the user's, did together. */
  turnId: string
  at: number
  table: string
  rowId: number
  op: JournalOp
  /** The row as it was, which is what undo writes back. Null for an insert. */
  before: unknown
  /** The row as it became, kept so undo can tell whether anything has changed since. */
  after: unknown
  origin: 'user' | 'assistant' | 'sql' | 'system'
  /** For a write that came from SQL, the statement that made it. */
  statement?: string
  profile?: string
  label?: string
}

/** Ninety days. Storage is proportional to changes, not to data, so this is cheap. */
export const RETENTION_MS = 90 * 24 * 60 * 60 * 1000
/** A guard rather than a policy: trimmed early only if the log itself grows absurd. */
const MAX_ENTRIES = 50_000

interface Turn {
  turnId: string
  origin: JournalEntry['origin']
  label?: string
  profile?: string
  statement?: string
}

let current: Turn | null = null
let paused = 0

/**
 * Everything written from here until `endTurn` belongs together.
 *
 * A turn is what a person undoes: not one row, and not everything since Tuesday, but the
 * whole of what one message or one action did. Nesting is ignored on purpose — an inner
 * call joins the turn already open rather than starting a second one.
 */
export function beginTurn(turn: Omit<Turn, 'turnId'> & { turnId?: string }): string {
  if (current) return current.turnId
  current = { ...turn, turnId: turn.turnId ?? crypto.randomUUID() }
  return current.turnId
}

export function endTurn(): void {
  current = null
}

/** What a write outside a turn belongs to: itself. */
function turnFor(): Turn {
  return current ?? { turnId: crypto.randomUUID(), origin: 'user' }
}

/**
 * Stops recording — for migrations and imports, which rewrite everything and would fill
 * the log with a copy of the entire vault to no purpose.
 */
export async function withoutJournal<T>(work: () => Promise<T>): Promise<T> {
  paused += 1
  try { return await work() }
  finally { paused -= 1 }
}

export function isJournalling(): boolean {
  return paused === 0
}

export async function record(entries: Omit<JournalEntry, 'turnId' | 'at' | 'origin' | 'profile' | 'statement' | 'label'>[]): Promise<void> {
  if (paused > 0 || entries.length === 0) return
  const turn = turnFor()
  const at = Date.now()
  await journalEntriesTable.bulkAdd(entries.map((entry) => ({
    createdAt: at,
    data: {
      ...entry,
      at,
      turnId: turn.turnId,
      origin: turn.origin,
      ...(turn.label ? { label: turn.label } : {}),
      ...(turn.profile ? { profile: turn.profile } : {}),
      ...(turn.statement ? { statement: turn.statement } : {}),
    } satisfies JournalEntry,
  })))
  await trim()
}

/** Old entries go by age; the count is a guard against a log that has run away. */
async function trim(): Promise<void> {
  const cutoff = Date.now() - RETENTION_MS
  const old = await journalEntriesTable.where('createdAt').below(cutoff).primaryKeys()
  if (old.length > 0) await journalEntriesTable.bulkDelete(old)

  const total = await journalEntriesTable.count()
  if (total <= MAX_ENTRIES) return
  const oldest = await journalEntriesTable.orderBy('createdAt').limit(total - MAX_ENTRIES).primaryKeys()
  await journalEntriesTable.bulkDelete(oldest)
}

export async function readJournal(): Promise<(JournalEntry & { id: number })[]> {
  return (await journalEntriesTable.orderBy('createdAt').reverse().toArray())
    .map((row: LocalRow) => ({ id: row.id, ...(row.data as JournalEntry) }))
}

/** One turn as it reads on a screen: when, what did it, and how much it touched. */
export interface JournalTurn {
  turnId: string
  at: number
  origin: JournalEntry['origin']
  label?: string
  profile?: string
  statement?: string
  /** Row counts per table, per operation — "deleted 812 rows" without reading anything. */
  counts: Record<string, { insert: number; update: number; delete: number }>
  entries: number
  undone: boolean
}

export async function listTurns(): Promise<JournalTurn[]> {
  const byTurn = new Map<string, JournalTurn>()
  for (const entry of await readJournal()) {
    const turn = byTurn.get(entry.turnId) ?? {
      turnId: entry.turnId,
      at: entry.at,
      origin: entry.origin,
      label: entry.label,
      profile: entry.profile,
      statement: entry.statement,
      counts: {},
      entries: 0,
      undone: false,
    }
    const counts = turn.counts[entry.table] ?? { insert: 0, update: 0, delete: 0 }
    counts[entry.op] += 1
    turn.counts[entry.table] = counts
    turn.entries += 1
    turn.at = Math.max(turn.at, entry.at)
    byTurn.set(entry.turnId, turn)
  }
  return [...byTurn.values()].sort((left, right) => right.at - left.at)
}

/**
 * Puts a turn back the way it was.
 *
 * In reverse, so a row inserted and then updated inside one turn unwinds in the order it
 * was wound; an insert becomes a delete, a delete becomes an insert, an update restores
 * what was there. Undoing is itself a turn, so it is in the log and can be undone.
 *
 * A row touched since the turn is refused rather than overwritten: the whole point is to
 * restore what somebody lost, and quietly discarding what they did afterwards would be a
 * second loss. The refusal names the rows so they can be looked at.
 */
export async function undoTurn(turnId: string, tables: Record<string, { get: (id: number) => Promise<unknown>; put: (row: unknown) => Promise<unknown>; delete: (id: number) => Promise<unknown> }>): Promise<{ restored: number; skipped: string[] }> {
  const entries = (await readJournal()).filter((entry) => entry.turnId === turnId)
  if (entries.length === 0) throw new Error('There is no record of that change.')

  const skipped: string[] = []
  let restored = 0

  await withoutJournal(async () => {
    for (const entry of entries) {
      const table = tables[entry.table]
      if (!table) { skipped.push(`${entry.table} is not a table this can restore`); continue }

      const now = await table.get(entry.rowId)
      if (!sameRow(now, entry.after)) {
        skipped.push(`${entry.table} #${entry.rowId} has changed since`)
        continue
      }

      if (entry.before === null) await table.delete(entry.rowId)
      else await table.put(entry.before)
      restored += 1
    }
  })

  // The undo is a turn of its own, so what it did is as visible as what it undid — and
  // so it can itself be undone, which is what somebody who undoes the wrong turn needs.
  beginTurn({ origin: 'system', label: `Undo of ${turnId.slice(0, 8)}` })
  await record(entries.map((entry) => ({
    table: entry.table,
    rowId: entry.rowId,
    op: entry.before === null ? ('delete' as const) : ('update' as const),
    before: entry.after,
    after: entry.before,
  })))
  endTurn()

  return { restored, skipped }
}

/** Equal enough: a row nobody has touched since, compared as it is stored. */
function sameRow(now: unknown, expected: unknown): boolean {
  if (now === undefined || now === null) return expected === null || expected === undefined
  return JSON.stringify(now) === JSON.stringify(expected)
}
