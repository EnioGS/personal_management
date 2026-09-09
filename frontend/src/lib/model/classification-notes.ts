import { refreshLocalStores } from '@/lib/local-store/create-local-list-store'
import { agentMemoryTable, classificationNotesTable } from './model-db'
import { NOTE_SCOPE_FIELDS, type ClassificationNote, type NoteScope, type RuleContext } from './types'

export type StoredNote = ClassificationNote & { id: number }

/**
 * The two records of what is known about this data, kept apart.
 *
 * Notes are the user explaining their own vault; memory is the assistant's working record.
 * Same shape, same operations, different tables — so a dozen sentences a person wrote are
 * not buried under the hundreds a machine did.
 */
export type NoteKind = 'note' | 'memory'

const TABLES = { note: classificationNotesTable, memory: agentMemoryTable }

/** Whether a scope says anything at all. A field left blank means nobody has said yet. */
export function scopeRefusal(scope: Partial<NoteScope> | undefined): string | null {
  if (!scope) return 'This needs a scope: which account, card, section, screen, class, category, subcategory and lines it is about. Write "global" where it genuinely is not restricted.'
  const empty = NOTE_SCOPE_FIELDS.filter((field) => !meaningful(scope[field]))
  if (empty.length === 0) return null
  return `These say nothing: ${empty.join(', ')}. Each needs a few words, or the word "global" where it is genuinely unrestricted — a blank means nobody has said yet, not that it applies everywhere.`
}

/** A dash is not an answer, and neither is a space. */
function meaningful(value: string | undefined): boolean {
  const text = (value ?? '').trim().toLowerCase()
  return text.length > 0 && !['-', '--', 'n/a', 'na', '?', '.', 'none', 'null', 'undefined'].includes(text)
}

/**
 * Oldest first: the notes read as a list of things established over time.
 *
 * A stage filter applies to notes and never to memory. Notes are split because they are
 * sent to the assistant per stage; memory is one record it keeps and reads whole, and
 * splitting it meant an entry written while a file was open was invisible from a confirmed
 * table — which the assistant read as an empty memory, and answered by writing the entry
 * a second time. `context` is still stored on a memory entry, saying where it came up.
 */
export async function listClassificationNotes(context?: RuleContext, kind: NoteKind = 'note'): Promise<StoredNote[]> {
  const rows = await TABLES[kind].toArray()
  return rows
    .map((row) => ({ id: row.id, ...(row.data as ClassificationNote) }))
    .filter((note) => kind === 'memory' || !context || note.context === context)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function addClassificationNote(note: Omit<ClassificationNote, 'createdAt'>, kind: NoteKind = 'note'): Promise<number> {
  const text = note.text.trim()
  if (!text) throw new Error('A note needs something in it.')
  const title = note.title?.trim()
  const id = await TABLES[kind].add({
    createdAt: Date.now(),
    data: { ...note, text, ...(title ? { title } : {}), createdAt: Date.now() },
  })
  await refreshLocalStores(kind === 'note' ? 'classificationNotes' : 'agentMemory')
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
  scope?: NoteScope,
  kind: NoteKind = 'note',
): Promise<void> {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('A note needs something in it.')
  const stored = await TABLES[kind].get(id)
  if (!stored) throw new Error(`Note ${id} was not found.`)
  const note = stored.data as ClassificationNote

  await TABLES[kind].update(id, {
    data: {
      ...note,
      text: trimmed,
      ...(scope ? { scope } : {}),
      // Left out means unchanged; emptied means the note goes back to leading with its
      // first line, which is a thing somebody might genuinely want.
      ...(title === undefined ? {} : title.trim() ? { title: title.trim() } : { title: undefined }),
      editedBy,
      editedAt: Date.now(),
    },
  })
  await refreshLocalStores(kind === 'note' ? 'classificationNotes' : 'agentMemory')
}

export async function deleteClassificationNote(id: number, kind: NoteKind = 'note'): Promise<void> {
  await TABLES[kind].delete(id)
  await refreshLocalStores(kind === 'note' ? 'classificationNotes' : 'agentMemory')
}

/** A scope as one line, for the places that show or send a note rather than edit it. */
export function describeScope(scope: NoteScope | undefined): string {
  if (!scope) return ''
  return NOTE_SCOPE_FIELDS
    .filter((field) => scope[field]?.trim() && scope[field].trim().toLowerCase() !== 'global')
    .map((field) => `${field}: ${scope[field].trim()}`)
    .join(', ')
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
    for (const note of own) {
      const scope = describeScope(note.scope)
      lines.push(`- ${note.title ? `**${note.title}** — ` : ''}${note.text}${scope ? ` _(${scope})_` : ''}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
