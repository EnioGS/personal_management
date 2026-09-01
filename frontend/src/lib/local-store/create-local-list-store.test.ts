import Dexie, { type EntityTable } from 'dexie'
import { describe, expect, it, vi } from 'vitest'
import { createLocalListStore } from './create-local-list-store'
import type { LocalRow } from './create-local-table'

interface Fixture {
  a: number
  b: string
}

const db = new Dexie('test-local-list-store-db') as Dexie & { rows: EntityTable<LocalRow, 'id'> }
db.version(1).stores({ rows: '++id, createdAt' })

const useFixtureStore = createLocalListStore<Fixture>(db.rows)

describe('createLocalListStore', () => {
  it('addItem resolves the new numeric id', async () => {
    const id = await useFixtureStore.getState().addItem({ a: 1, b: 'x' })
    expect(typeof id).toBe('number')
    expect(useFixtureStore.getState().items.some((r) => r.id === id)).toBe(true)
  })

  it('deleteItems bulk-removes only the given ids', async () => {
    const marker = crypto.randomUUID()
    await useFixtureStore.getState().addItems([
      { a: 1, b: `${marker}-x` },
      { a: 2, b: `${marker}-y` },
      { a: 3, b: `${marker}-z` },
    ])

    const items = useFixtureStore.getState().items.filter((r) => r.b.startsWith(marker))
    expect(items).toHaveLength(3)

    await useFixtureStore.getState().deleteItems([items[0].id, items[1].id])

    const remaining = useFixtureStore.getState().items.filter((r) => r.b.startsWith(marker))
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(items[2].id)
  })

  it('loads whatever is already stored, with no unlock step', async () => {
    const marker = crypto.randomUUID()
    await db.rows.add({ createdAt: Date.now(), data: { a: 9, b: marker } } as LocalRow)

    const useFreshStore = createLocalListStore<Fixture>(db.rows)

    await vi.waitFor(() => {
      expect(useFreshStore.getState().items.some((r) => r.b === marker)).toBe(true)
    })
  })
})
