import { addClassificationNote, deleteClassificationNote, editClassificationNote, listClassificationNotes } from '@/lib/model/classification-notes'
import type { RuleContext } from '@/lib/model/types'
import type { ToolDefinition } from './types'

export const listClassificationNotesTool: ToolDefinition = {
  name: 'list_classification_notes',
  description: "Lists the notes written about this vault's data — what a rule cannot express, such as that a shop nobody would recognise sells food, or that one file's rows for a given month were a rebalance. read_ingestion_guide already returns them; call this when you want them alone, or to check what is written before adding another.",
  parameters: { type: 'object', properties: { context: { type: 'string', enum: ['source', 'confirmed'] } }, additionalProperties: false },
  execute: async (args) => JSON.stringify(await listClassificationNotes(args.context as RuleContext | undefined)),
}

export const addClassificationNoteTool: ToolDefinition = {
  name: 'add_classification_note',
  description: "Writes down something worth knowing next time, in the user's own terms. Use it for what a rule cannot hold: an explanation the user gave you about a merchant, a convention one of their files follows, a judgement they made that you would otherwise have to ask about again. A note is not a rule — it labels nothing by itself — so write one whenever the user tells you something about their data, and quote them rather than paraphrasing your own reasoning back at them. Choose the stage the note is about: 'source' for something that matters while a file is being worked on, 'confirmed' for something about rows already in a table.",
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
  description: "Rewrites a note. Use it when what was written turns out to say two things, or to be wrong, or to name something by a word the app no longer uses — redrafting is how prose gets right, and a corrected note keeps its place in the list rather than reappearing as a new discovery. The whole text is replaced, so send the note as it should now read. Rewriting what the user wrote themselves is theirs to ask for; a note you wrote is yours to keep accurate.",
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
  description: "Removes a note. Like deleting a rule, this needs the user first: a note may be something they told you themselves, and it is theirs to withdraw.",
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
