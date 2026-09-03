import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { accountsTable, entriesTable, tableDefsTable } from './model-db'
import { alignDefaultTables, seedDefaultTables } from './seed-tables'
import type { TableDef } from './types'

describe('a fresh vault', () => {
  beforeEach(async () => { await wipeAllData() })

  it('opens with a table behind every screen, and one investments ledger for both classes', async () => {
    await seedDefaultTables()

    const tables = (await tableDefsTable.toArray()).map((row) => row.data as TableDef)
    expect(tables.map((table) => table.kind)).toEqual(['bankLedger', 'cardLedger', 'investmentLedger'])
    // Every one is named after the screen it belongs to, by key rather than by string.
    expect(tables.every((table) => Boolean(table.nameKey))).toBe(true)
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

    expect(await tableDefsTable.count()).toBe(3)
    expect(await accountsTable.count()).toBe(1)
  })
})

describe('a vault made before one table per screen', () => {
  beforeEach(async () => { await wipeAllData() })

  it('gives the tables their screens\' names, adds what is missing, and retires what is empty', async () => {
    await tableDefsTable.add({ createdAt: 1, data: { name: 'Extrato Nubank', kind: 'bankLedger' } })
    await tableDefsTable.add({ createdAt: 2, data: { name: 'Outros lançamentos', kind: 'generic' } })

    const result = await alignDefaultTables()

    const tables = (await tableDefsTable.toArray()).map((row) => row.data as TableDef)
    expect(tables.find((table) => table.kind === 'bankLedger')?.nameKey).toBe('finances:items.movements')
    expect(tables.some((table) => table.kind === 'generic')).toBe(false)
    expect(tables.map((table) => table.kind).sort()).toEqual(['bankLedger', 'cardLedger', 'investmentLedger'])
    expect(result.retired).toEqual(['Outros lançamentos'])
  })

  it('keeps a retired-kind table that still holds rows, rather than losing them to a tidy-up', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Aportes', kind: 'contributions' } })
    await entriesTable.add({ createdAt: 2, data: { tableId, date: 1, amount: 100 } })

    const result = await alignDefaultTables()

    expect(result.keptWithRows).toEqual(['Aportes'])
    expect(await tableDefsTable.get(tableId)).toBeDefined()
  })
})

describe('the six tables an earlier version seeded', () => {
  beforeEach(async () => { await wipeAllData() })

  it('become the three each screen owns, with the empty leftovers gone', async () => {
    for (const [name, kind] of [
      ['Extrato bancário', 'bankLedger'], ['Fatura do cartão', 'cardLedger'], ['Investimentos', 'investmentLedger'],
      ['Aportes', 'contributions'], ['Proventos', 'dividends'], ['Outros lançamentos', 'generic'],
    ] as const) {
      await tableDefsTable.add({ createdAt: 1, data: { name, kind } })
    }

    const result = await alignDefaultTables()

    const tables = (await tableDefsTable.toArray()).map((row) => row.data as TableDef)
    expect(tables).toHaveLength(3)
    expect(tables.map((table) => table.nameKey)).toEqual([
      'finances:items.movements',
      'finances:items.spending',
      'investments:section.label',
    ])
    expect(result.retired.sort()).toEqual(['Aportes', 'Outros lançamentos', 'Proventos'])
  })
})
