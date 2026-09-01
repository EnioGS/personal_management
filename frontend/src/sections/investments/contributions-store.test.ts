import { beforeEach, describe, expect, it } from 'vitest'
import { useContributionsStore, type Contribution } from './contributions-store'

function makeRow(overrides: Partial<Contribution> = {}): Contribution {
  return { date: Date.now(), amount: 500, destination: 'Renda Fixa', ...overrides }
}

describe('contributions-store', () => {
  beforeEach(async () => {
    await useContributionsStore.getState().refresh()
    await useContributionsStore.getState().deleteItems(useContributionsStore.getState().items.map((r) => r.id))
  })

  it('addItem/addItems/deleteItem round-trip through the browser-local table', async () => {
    await useContributionsStore.getState().addItem(makeRow({ destination: 'single' }))
    expect(useContributionsStore.getState().items.some((r) => r.destination === 'single')).toBe(true)

    await useContributionsStore.getState().addItems([makeRow({ destination: 'bulk-a' }), makeRow({ destination: 'bulk-b' })])
    expect(useContributionsStore.getState().items.filter((r) => r.destination?.startsWith('bulk-'))).toHaveLength(2)

    const toDelete = useContributionsStore.getState().items.find((r) => r.destination === 'single')
    await useContributionsStore.getState().deleteItem(toDelete!.id)
    expect(useContributionsStore.getState().items.some((r) => r.destination === 'single')).toBe(false)
  })

  it('refresh() reloads what is already stored, with no unlock step', async () => {
    await useContributionsStore.getState().addItem(makeRow({ destination: 'stored-marker' }))

    // Stand in for a page reload: in-memory items dropped, storage untouched.
    useContributionsStore.setState({ items: [] })
    await useContributionsStore.getState().refresh()

    expect(useContributionsStore.getState().items.some((r) => r.destination === 'stored-marker')).toBe(true)
  })
})
