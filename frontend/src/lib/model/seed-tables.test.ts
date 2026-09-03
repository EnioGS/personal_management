import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { accountsTable, tableDefsTable } from './model-db'
import { seedDefaultTables } from './seed-tables'
import type { TableDef } from './types'

describe('a fresh vault', () => {
  beforeEach(async () => { await wipeAllData() })

  it('opens with a table behind every screen, and one investments ledger for both classes', async () => {
    await seedDefaultTables()

    const kinds = (await tableDefsTable.toArray()).map((row) => (row.data as TableDef).kind)
    expect(kinds).toEqual(['bankLedger', 'cardLedger', 'investmentLedger', 'contributions', 'dividends', 'generic'])
    expect(kinds.filter((kind) => kind === 'investmentLedger')).toHaveLength(1)
    expect(await accountsTable.count()).toBe(1)
  })

  it('adds nothing to a vault that already has tables — a deleted table stays deleted', async () => {
    await tableDefsTable.add({ createdAt: 1, data: { name: 'Só esta', kind: 'generic' } })

    expect(await seedDefaultTables()).toEqual({ created: [] })
    expect(await tableDefsTable.count()).toBe(1)
  })
})

describe('seeding twice at once', () => {
  beforeEach(async () => { await wipeAllData() })

  it('creates one set, not two — StrictMode runs the effect twice', async () => {
    await Promise.all([seedDefaultTables(), seedDefaultTables()])

    expect(await tableDefsTable.count()).toBe(6)
    expect(await accountsTable.count()).toBe(1)
  })
})
