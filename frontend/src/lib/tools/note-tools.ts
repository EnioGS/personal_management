import { addClassificationNote, deleteClassificationNote, editClassificationNote, listClassificationNotes } from '@/lib/model/classification-notes'
import type { RuleContext } from '@/lib/model/types'
import type { ToolDefinition } from './types'

export const listClassificationNotesTool: ToolDefinition = {
  name: 'list_classification_notes',
  description: "Lists the notes written about this vault's data \u2014 what a rule cannot express, such as a merchant nobody would recognise, or what one file's rows for a month were. read_ingestion_guide already returns them; call this to see them alone, or before adding another.",
  parameters: { type: 'object', properties: { context: { type: 'string', enum: ['source', 'confirmed'] } }, additionalProperties: false },
  execute: async (args) => JSON.stringify(await listClassificationNotes(args.context as RuleContext | undefined)),
}

export const addClassificationNoteTool: ToolDefinition = {
  name: 'add_classification_note',
  description: "Writes down something worth knowing next time, in the user's own terms: an explanation they gave you, a convention one of their files follows, a judgement you would otherwise have to ask about again. A note labels nothing by itself. Choose the stage: 'source' for what matters while a file is worked on, 'confirmed' for rows already in a table. Quote the user rather than paraphrasing your own reasoning back at them.",
  parameters: {
    type: 'object',
    properties: {
      context: { type: 'string', enum: ['source', 'confirmed'] },
      text: { type: 'string', description: 'One thing, said plainly. Several notes beat one long one.' },
    },
    required: ['context', 'text'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.text !== 'string' || !args.text.trim()) return 'Error: a note needs something in it.'
    const context: RuleContext = args.context === 'source' ? 'source' : 'confirmed'
    const id = await addClassificationNote({ context, text: args.text, createdBy: 'assistant' })
    return JSON.stringify({ id, context, text: args.text.trim() })
  },
}

export const editClassificationNoteTool: ToolDefinition = {
  name: 'edit_classification_note',
  description: "Rewrites a note \u2014 when it says two things, or is wrong, or names something by a word the app no longer uses. The whole text is replaced, and the note keeps its place in the list. Rewriting what the user wrote is theirs to ask for.",
  parameters: {
    type: 'object',
    properties: {
      noteId: { type: 'number' },
      text: { type: 'string', description: 'The note as it should now read, in full.' },
    },
    required: ['noteId', 'text'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.noteId !== 'number') return 'Error: noteId is required.'
    if (typeof args.text !== 'string' || !args.text.trim()) return 'Error: a note needs something in it.'
    try {
      await editClassificationNote(args.noteId, args.text, 'assistant')
      return JSON.stringify({ noteId: args.noteId, text: args.text.trim() })
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
