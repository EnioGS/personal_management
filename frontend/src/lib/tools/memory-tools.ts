import {
  addClassificationNote,
  deleteClassificationNote,
  editClassificationNote,
  listClassificationNotes,
} from '@/lib/model/classification-notes'
import { scopeProblem } from './note-scope'
import { NOTE_SCOPE_FIELDS, type NoteScope, type RuleContext } from '@/lib/model/types'
import type { ToolDefinition } from './types'

const SCOPE_PROPERTIES = {
  account: { type: 'string' },
  card: { type: 'string' },
  section: { type: 'string' },
  screen: { type: 'string' },
  class: { type: 'string' },
  category: { type: 'string' },
  subcategory: { type: 'string' },
  lines: { type: 'string', description: 'Which rows inside that table, e.g. "the 14 Uber rows in March".' },
} as const

/**
 * What a title is for.
 *
 * Not decoration: with entries split by scope there are many of them, and the list is
 * read by its titles. A title naming the kind of entry rather than its subject —
 * "Reference facts — confirmed finance data" — sorts every subject under one heading and
 * makes the list say nothing, which is how one entry became a filing cabinet.
 */
const TITLE_RULE = 'The subject first, then what is said about it, e.g. "PagHiper — payment intermediary, buyer unknown" or "Nubank Main — card-bill payments". The list of entries is read by its titles, so name the thing itself: not the kind of entry it is ("reference facts", "notes", "unlabelled rows"), not when it was written, and specific enough that no two entries could share it.'

/** Titles that name the kind of entry rather than its subject, and so name nothing. */
const EMPTY_TITLES = [
  'reference', 'reference facts', 'facts', 'notes', 'note', 'memory', 'memories', 'misc',
  'miscellaneous', 'general', 'info', 'information', 'data', 'summary', 'confirmed data',
  'confirmed finance data', 'finance data', 'labelling', 'labeling', 'other', 'various',
]

function titleRefusal(title: string | undefined): string | null {
  const text = (title ?? '').trim().toLowerCase().replace(/[—–-]/g, ' ').replace(/\s+/g, ' ')
  if (!text) return 'an entry needs a title: it is how the entry is found in a list of them.'
  if (EMPTY_TITLES.includes(text)) {
    return `"${title}" names the kind of entry rather than its subject, so a list of entries titled that way says nothing. Name what this one is about.`
  }
  return null
}

const SCOPE_RULE = " Every scope field is required and must say something: a few words, or the word 'global' where it genuinely is not restricted — a blank means nobody has said yet, not that it applies everywhere. They narrow independently, so one class with everything else global is about that class in every table."

/**
 * The assistant's own record, kept apart from the user's notes.
 *
 * Read on demand rather than appended to the guide: what could not be labelled and why is
 * a working log that grows, and sending all of it on every request would cost more than it
 * saves. The guide says it exists; this is where it is fetched.
 */
export const readAgentMemoryTool: ToolDefinition = {
  name: 'read_agent_memory',
  description: "Your own record of this vault, whole: rows you could not label and what was missing, rows you could once the user explained, conventions you worked out. Read it before asking the user something, before labelling a file of a kind you have seen before, and always before writing to it — an entry that already covers the subject is edited, never added again. Not the user's notes, which arrive with the guide.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => JSON.stringify(await listClassificationNotes(undefined, 'memory')),
}

export const addAgentMemoryTool: ToolDefinition = {
  name: 'add_agent_memory',
  description: "Writes something down for next time: anything the user tells you that will matter again, what you could not label and exactly what was missing, what you could label once they explained, a convention you worked out. Read the memory first — one entry per scope, and a scope or a title already in use is refused, because what you were about to write belongs in the entry that already covers it. The scope is what organises this: let it decide where a fact goes rather than sorting facts by what kind of fact they are. Write as tersely as the meaning allows — this is a working log, not prose, and every word is paid for on the request that reads it." + SCOPE_RULE,
  parameters: {
    type: 'object',
    properties: {
      context: { type: 'string', enum: ['source', 'confirmed'], description: 'Where this came up. It does not hide the entry: memory is read whole.' },
      title: { type: 'string', description: TITLE_RULE },
      text: { type: 'string', description: 'The fact, as short as it can be said. Markdown lists are read.' },
      ...SCOPE_PROPERTIES,
    },
    required: ['context', 'title', 'text', ...NOTE_SCOPE_FIELDS],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.text !== 'string' || !args.text.trim()) return 'Error: an entry needs something in it.'
    const tooLong = lengthRefusal(args.text)
    if (tooLong) return `Error: ${tooLong}`
    const badTitle = titleRefusal(typeof args.title === 'string' ? args.title : undefined)
    if (badTitle) return `Error: ${badTitle}`
    const scope = scopeFrom(args)
    const refusal = await scopeProblem(scope, context.translate)
    if (refusal) return `Error: ${refusal}`
    const stage: RuleContext = args.context === 'source' ? 'source' : 'confirmed'
    const title = typeof args.title === 'string' ? args.title : undefined

    // One entry per scope, and per title. The failure this prevents is the same fact
    // stored twice, which reads back as two facts and cannot be corrected in one place.
    const entries = await listClassificationNotes(undefined, 'memory')
    const sameTitle = title ? entries.find((entry) => same(entry.title, title)) : undefined
    if (sameTitle) return `Error: entry ${sameTitle.id} is already titled "${sameTitle.title}". Rewrite it with edit_agent_memory — in full, keeping what still holds — or give this one a title of its own.`
    const sameScope = entries.find((entry) => entry.scope && NOTE_SCOPE_FIELDS.every((field) => same(entry.scope![field], scope[field])))
    if (sameScope) return `Error: entry ${sameScope.id} ("${sameScope.title ?? 'untitled'}") already covers exactly this scope. Add what you were going to say to it with edit_agent_memory, rewriting it in full — or narrow this scope, if it is really about something else.`

    const id = await addClassificationNote({ context: stage, title, text: args.text, scope, createdBy: 'assistant' }, 'memory')
    return JSON.stringify({ memoryId: id, context: stage, title, scope })
  },
}

export const editAgentMemoryTool: ToolDefinition = {
  name: 'edit_agent_memory',
  description: "Rewrites one of your entries in full — which is how an entry about rows you could not label shrinks as the user explains them, and how the entry about rows you could label grows. Keep the scope unless what it covers has changed.",
  parameters: {
    type: 'object',
    properties: {
      memoryId: { type: 'number' },
      title: { type: 'string', description: TITLE_RULE },
      text: { type: 'string', description: 'The entry as it should now read, in full.' },
      ...SCOPE_PROPERTIES,
    },
    required: ['memoryId', 'text'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.memoryId !== 'number') return 'Error: memoryId is required.'
    if (typeof args.text !== 'string' || !args.text.trim()) return 'Error: an entry needs something in it.'
    const tooLong = lengthRefusal(args.text)
    if (tooLong) return `Error: ${tooLong}`
    if (typeof args.title === 'string') {
      const badTitle = titleRefusal(args.title)
      if (badTitle) return `Error: ${badTitle}`
    }
    const scope = NOTE_SCOPE_FIELDS.some((field) => typeof args[field] === 'string') ? scopeFrom(args) : undefined
    if (scope) {
      const refusal = await scopeProblem(scope, context.translate)
      if (refusal) return `Error: ${refusal}`
    }
    try {
      const title = typeof args.title === 'string' ? args.title : undefined
      await editClassificationNote(args.memoryId, args.text, 'assistant', title, scope, 'memory')
      return JSON.stringify({ memoryId: args.memoryId, text: args.text.trim() })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'that entry could not be rewritten.'}` }
  },
}

export const deleteAgentMemoryTool: ToolDefinition = {
  name: 'delete_agent_memory',
  description: 'Removes one of your entries — when what it recorded has been dealt with entirely, rather than when it has merely shrunk. Pass confirmed: true, having said what it holds.',
  parameters: {
    type: 'object',
    properties: {
      memoryId: { type: 'number' },
      confirmed: { type: 'boolean', description: 'Say what the entry records before removing it, and only then.' },
    },
    required: ['memoryId', 'confirmed'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.memoryId !== 'number') return 'Error: memoryId is required.'
    if (args.confirmed !== true) return 'Error: say what this entry records, then call again with confirmed: true.'
    await deleteClassificationNote(args.memoryId, 'memory')
    return JSON.stringify({ memoryId: args.memoryId, deleted: true })
  },
}

/**
 * How long one entry may be.
 *
 * Not a storage limit — a shape one. An entry with no ceiling becomes the place everything
 * goes: the first one written under this design grew to four thousand characters covering
 * merchants, counterparties, tax, investments and a dated caveat, all scoped `global`, and
 * nothing in it could be found, corrected or trusted separately. The cap is what makes
 * "one entry per scope" mean splitting the facts rather than concatenating them.
 */
const MAX_ENTRY_CHARS = 1200

function lengthRefusal(text: string): string | null {
  if (text.trim().length <= MAX_ENTRY_CHARS) return null
  return `that entry is ${text.trim().length} characters and the limit is ${MAX_ENTRY_CHARS}. This is not a place to keep everything at once: split it into entries that each cover one scope — one account, one screen, one category, one set of lines — and put each fact where it belongs.`
}

/** Two pieces of scope or two titles saying the same thing, whatever the spacing or case. */
function same(left: string | undefined, right: string | undefined): boolean {
  return (left ?? '').trim().toLowerCase() === (right ?? '').trim().toLowerCase()
}

/** The eight scope fields, gathered off a flat argument object. */
function scopeFrom(args: Record<string, unknown>): NoteScope {
  return Object.fromEntries(
    NOTE_SCOPE_FIELDS.map((field) => [field, typeof args[field] === 'string' ? (args[field] as string) : '']),
  ) as unknown as NoteScope
}
