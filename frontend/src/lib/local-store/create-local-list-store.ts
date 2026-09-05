import type { EntityTable } from 'dexie'
import { create } from 'zustand'
import { createLocalTable, type LocalRow, type StoredRow } from './create-local-table'

interface LocalListState<T> {
  items: StoredRow<T>[]
  isLoading: boolean
  refresh: () => Promise<void>
  addItem: (value: T) => Promise<number>
  addItems: (values: T[]) => Promise<void>
  updateItem: (id: number, value: T) => Promise<void>
  deleteItem: (id: number) => Promise<void>
  deleteItems: (ids: number[]) => Promise<void>
}

/**
 * One Zustand store per Dexie table, for any JSON-serializable record type.
 * The store loads itself as soon as the module is imported — with no passphrase
 * to wait for, whatever is already in the browser is on screen from the first
 * render, without the user clicking anything (see adr/0019).
 */
/** Every store this factory has made, by the name of the Dexie table behind it. */
const refreshCallbacks = new Map<string, () => Promise<void>>()

/**
 * Re-reads every store created by this factory. For an operation that rewrites the tables
 * underneath them wholesale — import, wipe — where naming what changed would mean naming
 * everything.
 */
export async function refreshAllLocalStores(): Promise<void> {
  await Promise.all([...refreshCallbacks.values()].map((refresh) => refresh()))
}

/**
 * Re-reads only the stores named.
 *
 * Refreshing everything after every write means reading every row the app holds to show a
 * change to one of them — and with a few thousand rows in the browser that is the cost
 * the user feels when a file is imported or a cell is edited. Naming the tables that
 * actually changed keeps the reload proportional to the change. A name nothing was made
 * for is ignored rather than throwing: it can only mean a table with no store on it.
 */
export async function refreshLocalStores(...tables: string[]): Promise<void> {
  await Promise.all(tables.map((table) => refreshCallbacks.get(table)?.()).filter(Boolean))
}

export function createLocalListStore<T>(table: EntityTable<LocalRow, 'id'>) {
  const api = createLocalTable<T>(table)

  const useStore = create<LocalListState<T>>((set, get) => ({
    items: [],
    isLoading: true,

    refresh: async () => {
      set({ isLoading: true })
      set({ items: await api.list(), isLoading: false })
    },

    addItem: async (value) => {
      const id = await api.add(value)
      await get().refresh()
      return id
    },

    addItems: async (values) => {
      await api.bulkAdd(values)
      await get().refresh()
    },

    updateItem: async (id, value) => {
      await api.update(id, value)
      await get().refresh()
    },

    deleteItem: async (id) => {
      await api.remove(id)
      await get().refresh()
    },

    deleteItems: async (ids) => {
      await api.removeMany(ids)
      await get().refresh()
    },
  }))

  refreshCallbacks.set(table.name, () => useStore.getState().refresh())
  void useStore.getState().refresh()

  return useStore
}
