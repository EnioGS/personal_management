import { beforeEach, describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/current-value'
import { useVariableIncomeStore } from './variable-income-store'

function makeRow(overrides: Partial<Transaction> = {}): Transaction {
  return { date: Date.now(), asset: 'ABC', type: 'buy', quantity: 10, price: 5, note: crypto.randomUUID(), ...overrides }
}

describe('variable-income-store', () => {
  beforeEach(async () => {
    await useVariableIncomeStore.getState().refresh()
    await useVariableIncomeStore.getState().deleteItems(useVariableIncomeStore.getState().items.map((r) => r.id))
  })

  it('addItem/addItems/deleteItem round-trip through the browser-local table', async () => {
    await useVariableIncomeStore.getState().addItem(makeRow({ note: 'single' }))
    expect(useVariableIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    await useVariableIncomeStore.getState().addItems([makeRow({ note: 'bulk-a' }), makeRow({ note: 'bulk-b' })])
    expect(useVariableIncomeStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useVariableIncomeStore.getState().items.find((r) => r.note === 'single')
    await useVariableIncomeStore.getState().deleteItem(toDelete!.id)
    expect(useVariableIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })

  it('refresh() reloads what is already stored, with no unlock step', async () => {
    await useVariableIncomeStore.getState().addItem(makeRow({ note: 'stored-marker' }))

    // Stand in for a page reload: in-memory items dropped, storage untouched.
    useVariableIncomeStore.setState({ items: [] })
    await useVariableIncomeStore.getState().refresh()

    expect(useVariableIncomeStore.getState().items.some((r) => r.note === 'stored-marker')).toBe(true)
  })
})
