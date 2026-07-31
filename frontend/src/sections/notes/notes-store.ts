import { create } from 'zustand'
import { addNote, deleteNote, listNotes, type DecryptedNote } from './secure-db'

interface NotesState {
  passphrase: string | null
  notes: DecryptedNote[]
  isLoading: boolean
  unlock: (passphrase: string) => Promise<void>
  lock: () => void
  refresh: () => Promise<void>
  addNote: (text: string) => Promise<void>
  deleteNote: (id: number) => Promise<void>
}

export const useNotesStore = create<NotesState>((set, get) => ({
  passphrase: null,
  notes: [],
  isLoading: false,

  unlock: async (passphrase) => {
    set({ passphrase, isLoading: true })
    await get().refresh()
    set({ isLoading: false })
  },

  lock: () => set({ passphrase: null, notes: [] }),

  refresh: async () => {
    const { passphrase } = get()
    if (!passphrase) return
    const rows = await listNotes(passphrase)
    set({ notes: rows.filter((n): n is DecryptedNote => n !== null) })
  },

  addNote: async (text) => {
    const { passphrase } = get()
    if (!passphrase) return
    await addNote(passphrase, text)
    await get().refresh()
  },

  deleteNote: async (id) => {
    await deleteNote(id)
    await get().refresh()
  },
}))
