import type { EntityTable } from 'dexie'
import { create } from 'zustand'
import { useVaultStore } from '@/store/vault-store'
import { createEncryptedTable, type DecryptedRow, type EncryptedRow } from './create-encrypted-table'

interface EncryptedListState<T> {
  items: DecryptedRow<T>[]
  isLoading: boolean
  refresh: () => Promise<void>
  addItem: (value: T) => Promise<void>
  addItems: (values: T[]) => Promise<void>
  updateItem: (id: number, value: T) => Promise<void>
  deleteItem: (id: number) => Promise<void>
}

/**
 * Generalizes the notes section's Zustand store (see sections/notes/notes-store.ts)
 * for any JSON-serializable record type and Dexie table. Unlike notes-store.ts, this
 * does not hold its own passphrase — it reads/reacts to the shared useVaultStore, so
 * unlocking once unlocks every section built on this factory.
 */
export function createEncryptedListStore<T>(table: EntityTable<EncryptedRow, 'id'>) {
  const api = createEncryptedTable<T>(table)

  const useStore = create<EncryptedListState<T>>((set, get) => ({
    items: [],
    isLoading: false,

    refresh: async () => {
      const { passphrase } = useVaultStore.getState()
      if (!passphrase) return
      set({ isLoading: true })
      const rows = await api.list(passphrase)
      set({ items: rows.filter((r): r is DecryptedRow<T> => r !== null), isLoading: false })
    },

    addItem: async (value) => {
      const { passphrase } = useVaultStore.getState()
      if (!passphrase) return
      await api.add(passphrase, value)
      await get().refresh()
    },

    addItems: async (values) => {
      const { passphrase } = useVaultStore.getState()
      if (!passphrase) return
      await api.bulkAdd(passphrase, values)
      await get().refresh()
    },

    updateItem: async (id, value) => {
      const { passphrase } = useVaultStore.getState()
      if (!passphrase) return
      await api.update(passphrase, id, value)
      await get().refresh()
    },

    deleteItem: async (id) => {
      await api.remove(id)
      await get().refresh()
    },
  }))

  useVaultStore.subscribe((state, prevState) => {
    if (state.passphrase && state.passphrase !== prevState.passphrase) {
      void useStore.getState().refresh()
    } else if (!state.passphrase && prevState.passphrase) {
      useStore.setState({ items: [] })
    }
  })

  return useStore
}
