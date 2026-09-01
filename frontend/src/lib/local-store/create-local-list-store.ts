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
const refreshCallbacks: (() => Promise<void>)[] = []

/**
 * Re-reads every store created by this factory. Used after an operation that
 * rewrites the tables underneath them (import/wipe in lib/data-file.ts), which
 * the individual stores have no way of noticing on their own.
 */
export async function refreshAllLocalStores(): Promise<void> {
  await Promise.all(refreshCallbacks.map((refresh) => refresh()))
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

  refreshCallbacks.push(() => useStore.getState().refresh())
  void useStore.getState().refresh()

  return useStore
}
