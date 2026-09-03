import { accountsTable, tableDefsTable } from './model-db'
import type { Account, TableDef } from './types'

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

const DEFAULT_TABLES: TableDef[] = [
  { name: 'Extrato bancário', kind: 'bankLedger' },
  { name: 'Fatura do cartão', kind: 'cardLedger' },
  { name: 'Investimentos', kind: 'investmentLedger' },
  { name: 'Aportes', kind: 'contributions' },
  { name: 'Proventos', kind: 'dividends' },
  { name: 'Outros lançamentos', kind: 'generic' },
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
