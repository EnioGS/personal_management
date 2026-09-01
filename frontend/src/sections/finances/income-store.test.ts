import { beforeEach, describe, expect, it } from 'vitest'
import { useIncomeStore, type IncomeRow } from './income-store'

function makeRow(overrides: Partial<IncomeRow> = {}): IncomeRow {
  return { date: Date.now(), source: 'Salário', amount: 1000, note: crypto.randomUUID(), ...overrides }
}

describe('income-store', () => {
  beforeEach(async () => {
    await useIncomeStore.getState().refresh()
    await useIncomeStore.getState().deleteItems(useIncomeStore.getState().items.map((r) => r.id))
  })

  it('addItem/addItems/deleteItem round-trip through the browser-local table', async () => {
    await useIncomeStore.getState().addItem(makeRow({ note: 'single' }))
    expect(useIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    await useIncomeStore.getState().addItems([makeRow({ note: 'bulk-a' }), makeRow({ note: 'bulk-b' })])
    expect(useIncomeStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useIncomeStore.getState().items.find((r) => r.note === 'single')
    await useIncomeStore.getState().deleteItem(toDelete!.id)
    expect(useIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })

  it('refresh() reloads what is already stored, with no unlock step', async () => {
    await useIncomeStore.getState().addItem(makeRow({ note: 'stored-marker' }))

    // Stand in for a page reload: in-memory items dropped, storage untouched.
    useIncomeStore.setState({ items: [] })
    await useIncomeStore.getState().refresh()

    expect(useIncomeStore.getState().items.some((r) => r.note === 'stored-marker')).toBe(true)
  })
})
