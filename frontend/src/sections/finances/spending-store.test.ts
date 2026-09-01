import { beforeEach, describe, expect, it } from 'vitest'
import { useSpendingStore, type SpendingRow } from './spending-store'

function makeRow(overrides: Partial<SpendingRow> = {}): SpendingRow {
  return { date: Date.now(), category: 'Outros', amount: 42, note: crypto.randomUUID(), ...overrides }
}

describe('spending-store', () => {
  beforeEach(async () => {
    await useSpendingStore.getState().refresh()
    await useSpendingStore.getState().deleteItems(useSpendingStore.getState().items.map((r) => r.id))
  })

  it('addItem/addItems/deleteItem round-trip through the browser-local table', async () => {
    await useSpendingStore.getState().addItem(makeRow({ note: 'single' }))
    expect(useSpendingStore.getState().items.some((r) => r.note === 'single')).toBe(true)

    await useSpendingStore.getState().addItems([makeRow({ note: 'bulk-a' }), makeRow({ note: 'bulk-b' })])
    expect(useSpendingStore.getState().items.filter((r) => r.note?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useSpendingStore.getState().items.find((r) => r.note === 'single')
    await useSpendingStore.getState().deleteItem(toDelete!.id)
    expect(useSpendingStore.getState().items.some((r) => r.note === 'single')).toBe(false)
  })

  it('refresh() reloads what is already stored, with no unlock step', async () => {
    await useSpendingStore.getState().addItem(makeRow({ note: 'stored-marker' }))

    // Stand in for a page reload: in-memory items dropped, storage untouched.
    useSpendingStore.setState({ items: [] })
    await useSpendingStore.getState().refresh()

    expect(useSpendingStore.getState().items.some((r) => r.note === 'stored-marker')).toBe(true)
  })
})
