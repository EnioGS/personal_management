import { refreshLocalStores } from '@/lib/local-store/create-local-list-store'
import { classificationNotesTable } from './model-db'
import type { ClassificationNote, RuleContext } from './types'

export type StoredNote = ClassificationNote & { id: number }

/** Oldest first: the notes read as a list of things established over time. */
export async function listClassificationNotes(context?: RuleContext): Promise<StoredNote[]> {
  const rows = await classificationNotesTable.toArray()
  return rows
    .map((row) => ({ id: row.id, ...(row.data as ClassificationNote) }))
    .filter((note) => !context || note.context === context)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function addClassificationNote(note: Omit<ClassificationNote, 'createdAt'>): Promise<number> {
  const text = note.text.trim()
  if (!text) throw new Error('A note needs something in it.')
  const title = note.title?.trim()
  const id = await classificationNotesTable.add({
    createdAt: Date.now(),
    data: { ...note, text, ...(title ? { title } : {}), createdAt: Date.now() },
  })
  await refreshLocalStores('classificationNotes')
  return id
}

/**
 * Rewrites a note.
 *
 * A note is prose about the data, and prose is got right by being redrafted — a sentence
 * that turned out to say two things, a merchant that changed hands, a convention stated
 * before it was fully understood. Editing it keeps the note where it is in the list
 * rather than making a correction look like a new discovery, so `createdAt` is untouched
 * and `editedAt` records that it was gone over.
 */
export async function editClassificationNote(
  id: number,
  text: string,
  editedBy: 'user' | 'assistant',
  title?: string,
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('A note needs something in it.')
  const stored = await classificationNotesTable.get(id)
  if (!stored) throw new Error(`Note ${id} was not found.`)
  const note = stored.data as ClassificationNote

  await classificationNotesTable.update(id, {
    data: {
      ...note,
      text: trimmed,
      // Left out means unchanged; emptied means the note goes back to leading with its
      // first line, which is a thing somebody might genuinely want.
      ...(title === undefined ? {} : title.trim() ? { title: title.trim() } : { title: undefined }),
      editedBy,
      editedAt: Date.now(),
    },
  })
  await refreshLocalStores('classificationNotes')
}

export async function deleteClassificationNote(id: number): Promise<void> {
  await classificationNotesTable.delete(id)
  await refreshLocalStores('classificationNotes')
}

/**
 * The notes of a stage, as the assistant is given them.
 *
 * Appended to the guide rather than kept in a tool of their own to be asked for: the
 * assistant already reads the guide before touching an import, and a note nobody
 * remembered to look up is a note that changed nothing.
 */
export async function classificationNotesForPrompt(): Promise<string> {
  const notes = await listClassificationNotes()
  if (notes.length === 0) return ''

  const lines = ['', '## Notes on this data', '', 'Written by the user or by you, and true of this vault rather than of the app. Read them as the user talking about their own data: they say what a rule cannot, and they outrank your own guesswork about what a row means.', '']
  for (const stage of ['source', 'confirmed'] as const) {
    const own = notes.filter((note) => note.context === stage)
    if (own.length === 0) continue
    lines.push(stage === 'source' ? '**While working on a file:**' : '**About rows already confirmed:**')
    for (const note of own) lines.push(`- ${note.title ? `**${note.title}** — ` : ''}${note.text} _(${note.createdBy})_`)
    lines.push('')
  }
  return lines.join('\n')
}
