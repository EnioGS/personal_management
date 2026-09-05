import { addClassificationNote, deleteClassificationNote, listClassificationNotes } from '@/lib/model/classification-notes'
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
