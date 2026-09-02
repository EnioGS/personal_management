import { beforeEach, describe, expect, it } from 'vitest'
import { TABLE_KIND_SCHEMAS } from '@/lib/model/table-kinds'
import { useTableDefsStore } from '@/lib/model/model-stores'
import { addItemFor, findWritableTable, itemsFor, writableTables } from './writable-tables'
import { clearTables, seedTable } from './test-utils'

describe('writableTables', () => {
  beforeEach(clearTables)

  it('is empty when the user has created no tables', () => {
    expect(writableTables()).toEqual([])
  })

  it('reflects every table definition, by id', async () => {
    const gastosId = await seedTable('generic', 'Gastos')
    const cardId = await seedTable('cardLedger', 'Meu Cartão')

    // The underlying store lists newest first (same convention as every other local
    // list store), so this checks membership/labels rather than a fixed order.
    const tables = writableTables()
    expect(tables.map((t) => t.key).sort()).toEqual([gastosId, cardId].sort())
    expect(tables.find((t) => t.key === gastosId)?.label).toBe('Gastos')
    expect(tables.find((t) => t.key === cardId)?.label).toBe('Meu Cartão')
  })

  it("a table's schema matches its kind", async () => {
    const key = await seedTable('cardLedger')
    const table = findWritableTable(key)!
    expect(table.schema).toBe(TABLE_KIND_SCHEMAS.cardLedger)
  })

  it('picks up a table created after the last call — no caching', async () => {
    expect(writableTables()).toEqual([])
    await seedTable('generic')
    expect(writableTables()).toHaveLength(1)
  })
})

describe('findWritableTable', () => {
  beforeEach(clearTables)

  it('returns undefined for an unknown key', () => {
    expect(findWritableTable('does_not_exist')).toBeUndefined()
  })

  it('finds a table by its id', async () => {
    const key = await seedTable('generic', 'Gastos')
    expect(findWritableTable(key)?.label).toBe('Gastos')
  })
})

describe('itemsFor / addItemFor', () => {
  beforeEach(clearTables)

  it('scopes rows to one table, tagging new entries with its tableId', async () => {
    const tableAId = Number(await seedTable('generic', 'A'))
    const tableBId = Number(await seedTable('generic', 'B'))

    await addItemFor(tableAId, { date: Date.now(), category: 'Outros', amount: 1 })
    await addItemFor(tableBId, { date: Date.now(), category: 'Outros', amount: 2 })

    expect(itemsFor(tableAId)).toHaveLength(1)
    expect(itemsFor(tableBId)).toHaveLength(1)
    expect(itemsFor(tableAId)[0].amount).toBe(1)
  })

  it("addItemFor resolves the new row's numeric id", async () => {
    const tableId = Number(await seedTable('generic'))
    const id = await addItemFor(tableId, { date: Date.now(), category: 'Outros', amount: 1 })
    expect(typeof id).toBe('number')
  })
})

// Guards the store wiring itself, independent of the tool-facing helpers above.
describe('useTableDefsStore', () => {
  beforeEach(clearTables)

  it('exposes items/addItem/addItems/updateItem', () => {
    const state = useTableDefsStore.getState()
    expect(Array.isArray(state.items)).toBe(true)
    expect(typeof state.addItem).toBe('function')
    expect(typeof state.addItems).toBe('function')
    expect(typeof state.updateItem).toBe('function')
  })
})
