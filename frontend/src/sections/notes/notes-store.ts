import { createEncryptedListStore } from '@/lib/secure-store/create-encrypted-list-store'
import { notesTable } from './secure-db'

export interface NoteRecord {
  text: string
}

export const useNotesStore = createEncryptedListStore<NoteRecord>(notesTable)
