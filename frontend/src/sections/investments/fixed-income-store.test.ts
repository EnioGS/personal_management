import { beforeEach, describe, expect, it } from 'vitest'
import type { Transaction } from '@/lib/current-value'
import { useFixedIncomeStore } from './fixed-income-store'

function makeRow(overrides: Partial<Transaction> = {}): Transaction {
  return { date: Date.now(), asset: 'CDB', type: 'buy', quantity: 1, price: 1000, note: crypto.randomUUID(), ...overrides }
}

describe('fixed-income-store', () => {
  beforeEach(async () => {
    await useFixedIncomeStore.getState().refresh()
    await useFixedIncomeStore.getState().deleteItems(useFixedIncomeStore.getState().items.map((r) => r.id))
  })

  it('addItem/addItems/deleteItem round-trip through the browser-local table', async () => {
    await useFixedIncomeStore.getState().addItem(makeRow({ note: 'single' }))
    expect(useFixedIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    await useFixedIncomeStore.getState().addItems([makeRow({ note: 'bulk-a' }), makeRow({ note: 'bulk-b' })])
    expect(useFixedIncomeStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useFixedIncomeStore.getState().items.find((r) => r.note === 'single')
    await useFixedIncomeStore.getState().deleteItem(toDelete!.id)
    expect(useFixedIncomeStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })

  it('refresh() reloads what is already stored, with no unlock step', async () => {
    await useFixedIncomeStore.getState().addItem(makeRow({ note: 'stored-marker' }))

    // Stand in for a page reload: in-memory items dropped, storage untouched.
    useFixedIncomeStore.setState({ items: [] })
    await useFixedIncomeStore.getState().refresh()

    expect(useFixedIncomeStore.getState().items.some((r) => r.note === 'stored-marker')).toBe(true)
  })
})
