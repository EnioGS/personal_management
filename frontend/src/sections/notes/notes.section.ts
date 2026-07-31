import { FileText } from 'lucide-react'
import type { AppSection } from '../types'
import { NotesPanel } from './notes-panel'

export const notesSection: AppSection = {
  id: 'notes',
  labelKey: 'notes:section.label',
  icon: FileText,
  items: [{ id: 'all', labelKey: 'notes:items.allNotes', icon: FileText, component: NotesPanel }],
}
