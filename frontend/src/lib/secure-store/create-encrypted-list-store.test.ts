import Dexie, { type EntityTable } from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { useVaultStore } from '@/store/vault-store'
import { createEncryptedListStore } from './create-encrypted-list-store'
import type { EncryptedRow } from './create-encrypted-table'

interface Fixture {
  a: number
  b: string
}

const db = new Dexie('test-encrypted-list-store-db') as Dexie & { rows: EntityTable<EncryptedRow, 'id'> }
db.version(1).stores({ rows: '++id, createdAt' })

const useFixtureStore = createEncryptedListStore<Fixture>(db.rows)

describe('createEncryptedListStore', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useFixtureStore.setState({ items: [] })
  })

  it('addItem resolves the new numeric id', async () => {
    useVaultStore.getState().unlock(`pw-${crypto.randomUUID()}`)
    const id = await useFixtureStore.getState().addItem({ a: 1, b: 'x' })
    expect(typeof id).toBe('number')
    expect(useFixtureStore.getState().items.some((r) => r.id === id)).toBe(true)
  })

  it('deleteItems bulk-removes only the given ids', async () => {
    useVaultStore.getState().unlock(`pw-${crypto.randomUUID()}`)
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
})
