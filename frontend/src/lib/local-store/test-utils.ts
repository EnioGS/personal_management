/**
 * Test-only helper: empties a store *and* its Dexie table. Tests can no longer
 * reset by dropping in-memory items alone — with no passphrase, rows written by
 * an earlier test are still readable by the next one.
 */
interface ClearableStore {
  getState: () => {
    items: { id: number }[]
    refresh: () => Promise<void>
    deleteItems: (ids: number[]) => Promise<void>
  }
}

export async function clearLocalStores(...stores: ClearableStore[]): Promise<void> {
  for (const store of stores) {
    await store.getState().refresh()
    await store.getState().deleteItems(store.getState().items.map((row) => row.id))
  }
}
