import { addClassificationNote, deleteClassificationNote, editClassificationNote, listClassificationNotes, scopeRefusal } from '@/lib/model/classification-notes'
import { NOTE_SCOPE_FIELDS, type NoteScope, type RuleContext } from '@/lib/model/types'
import type { ToolDefinition } from './types'

export const listClassificationNotesTool: ToolDefinition = {
  name: 'list_classification_notes',
  description: "Lists the notes written about this vault's data \u2014 what a rule cannot express, such as a merchant nobody would recognise, or what one file's rows for a month were. read_ingestion_guide already returns them; call this to see them alone, or before adding another.",
  parameters: { type: 'object', properties: { context: { type: 'string', enum: ['source', 'confirmed'] } }, additionalProperties: false },
  execute: async (args) => JSON.stringify(await listClassificationNotes(args.context as RuleContext | undefined)),
}

export const addClassificationNoteTool: ToolDefinition = {
  name: 'add_classification_note',
  description: "Writes down something worth knowing next time, in the user's own terms: an explanation they gave you, a convention one of their files follows, a judgement you would otherwise have to ask about again. A note labels nothing by itself. Choose the stage: 'source' for what matters while a file is worked on, 'confirmed' for rows already in a table. Quote the user rather than paraphrasing your own reasoning back at them. Give it a title of a few words \u2014 the list shows titles, and a note without one is found by reading it. Every scope field is required and must say something: name what it is about in a few words, or the word 'global' where it genuinely is not restricted \u2014 a blank means nobody has said yet, not that it applies everywhere. They narrow independently, so one class with everything else global is a note about that class in every table, which is rarely what was meant.",
  parameters: {
    type: 'object',
    properties: {
      context: { type: 'string', enum: ['source', 'confirmed'] },
      title: { type: 'string', description: 'A few words naming what this is about, e.g. "Charme is a market".' },
      text: { type: 'string', description: 'One thing, said plainly. Several notes beat one long one.' },
      account: { type: 'string' },
      card: { type: 'string' },
      section: { type: 'string' },
      screen: { type: 'string' },
      class: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      lines: { type: 'string', description: 'Which rows inside that table, e.g. "the three in March".' },
    },
    required: ['context', 'title', 'text', 'account', 'card', 'section', 'screen', 'class', 'category', 'subcategory', 'lines'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.text !== 'string' || !args.text.trim()) return 'Error: a note needs something in it.'
    const context: RuleContext = args.context === 'source' ? 'source' : 'confirmed'
    const title = typeof args.title === 'string' ? args.title : undefined
    const scope = scopeFrom(args)
    const refusal = scopeRefusal(scope)
    if (refusal) return `Error: ${refusal}`
    const id = await addClassificationNote({ context, title, text: args.text, scope, createdBy: 'assistant' })
    return JSON.stringify({ id, context, text: args.text.trim() })
  },
}

export const editClassificationNoteTool: ToolDefinition = {
  name: 'edit_classification_note',
  description: "Rewrites a note \u2014 when it says two things, or is wrong, or names something by a word the app no longer uses. The whole text is replaced, and the note keeps its place in the list. Pass title to rename it, or an empty title to let it lead with its first line again. Pass every scope field when narrowing what it covers. Rewriting what the user wrote is theirs to ask for.",
  parameters: {
    type: 'object',
    properties: {
      noteId: { type: 'number' },
      title: { type: 'string', description: 'A few words naming what it is about. Left out, the title it has is kept.' },
      text: { type: 'string', description: 'The note as it should now read, in full.' },
      account: { type: 'string' },
      card: { type: 'string' },
      section: { type: 'string' },
      screen: { type: 'string' },
      class: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      lines: { type: 'string', description: 'Which rows inside that table, e.g. "the three in March".' },
    },
    required: ['noteId', 'text'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.noteId !== 'number') return 'Error: noteId is required.'
    if (typeof args.text !== 'string' || !args.text.trim()) return 'Error: a note needs something in it.'
    try {
      const title = typeof args.title === 'string' ? args.title : undefined
      // Left out entirely, the scope stands; given at all, it has to say something.
      const scope = NOTE_SCOPE_FIELDS.some((field) => typeof args[field] === 'string') ? scopeFrom(args) : undefined
      if (scope) {
        const refusal = scopeRefusal(scope)
        if (refusal) return `Error: ${refusal}`
      }
      await editClassificationNote(args.noteId, args.text, 'assistant', title, scope)
      return JSON.stringify({ noteId: args.noteId, title: title?.trim() ?? null, text: args.text.trim() })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'that note could not be rewritten.'}` }
  },
}

export const deleteClassificationNoteTool: ToolDefinition = {
  name: 'delete_classification_note',
  description: "Removes a note. Ask the user first: a note may be something they told you themselves.",
  parameters: {
    type: 'object',
    properties: { noteId: { type: 'number' }, confirmed: { type: 'boolean' } },
    required: ['noteId'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.noteId !== 'number') return 'Error: noteId is required.'
    if (args.confirmed !== true) return 'Error: confirmation is required. Ask the user before deleting a note, then call again with confirmed: true.'
    await deleteClassificationNote(args.noteId)
    return JSON.stringify({ deleted: args.noteId })
  },
}

/** The eight scope fields, gathered off a flat argument object. */
function scopeFrom(args: Record<string, unknown>): NoteScope {
  return Object.fromEntries(
    NOTE_SCOPE_FIELDS.map((field) => [field, typeof args[field] === 'string' ? (args[field] as string) : '']),
  ) as unknown as NoteScope
}
