import { accountsTable, entriesTable, tableDefsTable } from './model-db'
import type { Account, Entry, TableDef, TableKind } from './types'

/**
 * The tables every screen needs, created once on a fresh vault.
 *
 * A screen used to be broken until someone thought to add the table behind it, which
 * is a strange thing to ask of a new user — and now that tables are created nowhere
 * else (the Data ingestion centre chooses among them, it does not invent them), the
 * set has to exist from the start. It is deliberately small: one ledger per kind of
 * money, with the distinctions that used to be separate tables — fixed versus variable
 * income — carried by the rows instead.
 */
const DEFAULT_ACCOUNT: Account = { name: 'Conta principal', kind: 'checking' }

/**
 * One table per screen, carrying that screen's own name.
 *
 * What used to be several tables is one plus labels: contributions and dividends are
 * investment rows of a particular kind, and a "general" table was a place for rows
 * nobody had decided about — which is what the ingestion worklist is for now.
 */
const DEFAULT_TABLES: TableDef[] = [
  { name: 'Movimentações', nameKey: 'finances:items.movements', kind: 'bankLedger' },
  { name: 'Gastos', nameKey: 'finances:items.spending', kind: 'cardLedger' },
  { name: 'Investimentos', nameKey: 'investments:section.label', kind: 'investmentLedger' },
]

/**
 * One run at a time, whoever asks.
 *
 * React's StrictMode invokes an effect twice in development, and two runs that both
 * read an empty table before either writes will both seed it — which is how a fresh
 * vault ended up with every table twice. The check and the writes share a transaction,
 * and callers share a promise.
 */
let seeding: Promise<{ created: string[] }> | null = null

export async function seedDefaultTables(): Promise<{ created: string[] }> {
  // The shared promise is dropped as soon as it settles, so a run that fails does not
  // become the answer every later caller gets.
  seeding ??= runSeed().finally(() => { seeding = null })
  return seeding
}

async function runSeed(): Promise<{ created: string[] }> {
  return tableDefsTable.db.transaction('rw', tableDefsTable, accountsTable, async () => {
    // Only a genuinely empty vault is seeded: a user who deleted a table meant to.
    if ((await tableDefsTable.count()) > 0) return { created: [] }

    const accountId = await accountsTable.add({ createdAt: Date.now(), data: DEFAULT_ACCOUNT })
    const created: string[] = []
    for (const table of DEFAULT_TABLES) {
      await tableDefsTable.add({ createdAt: Date.now(), data: table.kind === 'bankLedger' ? { ...table, accountId } : table })
      created.push(table.name)
    }
    return { created }
  })
}

/** Kinds that no longer have a screen of their own; their data lives in another ledger. */
const RETIRED_KINDS: TableKind[] = ['generic', 'contributions', 'dividends']

export interface AlignmentResult {
  named: string[]
  created: string[]
  retired: string[]
  keptWithRows: string[]
}

/**
 * Brings a vault created before "one table per screen" into line with it.
 *
 * Three things can be wrong in an older vault: a table has a name typed in whatever
 * language it was made in rather than a key; a screen has no table at all; or a table
 * exists for a kind that no longer has a screen. The first two are simply corrected.
 * The third is only removed when it is empty — a table with rows in it is somebody's
 * data, and losing it silently to a tidy-up would be worse than an extra name in a
 * list.
 */
export async function alignDefaultTables(): Promise<AlignmentResult> {
  const result: AlignmentResult = { named: [], created: [], retired: [], keptWithRows: [] }
  const stored = await tableDefsTable.toArray()
  if (stored.length === 0) return result

  const entries = (await entriesTable.toArray()).map((row) => row.data as Entry)
  const rowsByTable = new Map<number, number>()
  for (const entry of entries) rowsByTable.set(entry.tableId, (rowsByTable.get(entry.tableId) ?? 0) + 1)

  for (const wanted of DEFAULT_TABLES) {
    const matches = stored.filter((row) => (row.data as TableDef).kind === wanted.kind)
    if (matches.length === 0) {
      await tableDefsTable.add({ createdAt: Date.now(), data: wanted })
      result.created.push(wanted.name)
      continue
    }
    // The oldest table of a kind is the one that screen has been reading all along.
    const owner = matches[0]
    const table = owner.data as TableDef
    if (table.nameKey !== wanted.nameKey) {
      await tableDefsTable.update(owner.id, { data: { ...table, nameKey: wanted.nameKey } })
      result.named.push(table.name)
    }
  }

  for (const row of stored) {
    const table = row.data as TableDef
    if (!RETIRED_KINDS.includes(table.kind)) continue
    if ((rowsByTable.get(row.id) ?? 0) > 0) { result.keptWithRows.push(table.name); continue }
    await tableDefsTable.delete(row.id)
    result.retired.push(table.name)
  }

  return result
}
