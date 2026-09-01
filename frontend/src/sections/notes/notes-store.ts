import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import { notesTable } from './notes-db'

export interface NoteRecord {
  text: string
}

export const useNotesStore = createLocalListStore<NoteRecord>(notesTable)
