import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import { assistantPromptsTable } from './assistant-prompts-db'

export interface AssistantPrompt {
  key: string
  content: string
}

export const SYSTEM_PROMPT_KEY = 'system'

const ROW_ACCESS_PROMPT = 'You can read and write the browser database with SQL, and your writes are disciplined rather than free: never edit a row in place — add the corrected row with the same row_id and mark the old one for elimination. You cannot delete anything, and you cannot change accounts, cards, or other settings.'
/** Every sentence this one has replaced, so a prompt saved under any of them is brought forward. */
const LEGACY_ROW_ACCESS_PROMPTS = [
  'You cannot add, edit, correct, delete, or restore table rows, and you cannot change accounts, cards, or other settings.',
  'Finance tables are read-only to you. Every change to the data — adding a row, correcting one, taking one out — is made in the Data ingestion centre, where a row keeps its raw values and its labels are explicit; you cannot write to a table directly, and you cannot change accounts, cards, or other settings.',
]

/**
 * The paragraph that makes the assistant keep its own record, and the mark that says a
 * prompt already has it.
 *
 * Kept separate from the default so a vault whose prompt was saved before this existed
 * gets it too: the alternative is a user whose assistant silently never learns anything,
 * with nothing on screen to say why. Matched on a fragment rather than the whole text so
 * an edited version of the paragraph is left alone.
 */
const MEMORY_PROMPT = "Keep your own record, unasked: when the user explains something you did not know, open the memory toolset and write it down before answering, and read it back before asking what they may have answered already. Short entries, each scoped to what it is about. Nothing else you learn survives this conversation."
const MEMORY_PROMPT_MARK = 'Keep your own record, unasked'

/**
 * Not translated (en/pt) like the rest of the app's UI strings — this is data sent
 * to the model, not a UI label, so it stays in one language regardless of locale.
 * See adr/0016-assistant-prompts-not-translated.md.
 *
 * This is only the default for freshly-created vaults — changing it does not touch
 * an already-saved custom prompt in an existing vault.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are the assistant built into Personal Management, a local-first finance app. Everything is in the user's browser; there is no backend. You read files they attach, query their data with SQL, and change it through tools that validate what they are given.

One rule never bends: a correction is an added row with the same row_id and the old one marked, not an edit in place — the pair is what makes the change visible. Everything else you may do with SQL, deleting included; every write is planned before it runs and undoable whole, so say what a large change will do before you make it.

Before doing or explaining anything about importing, assigning columns, labelling, signs, rules or confirming — including a plain request for help with it — call read_ingestion_guide and follow it. It carries the labels, the order of the work, and the notes written about this particular vault. It is fetched rather than repeated here, so a conversation that never touches data never pays for it.

${MEMORY_PROMPT}

Do the work rather than describing what you are about to do: a turn that says what you will look at next, and stops, has done nothing. Keep calling tools until the task is finished or you need the user, and when several calls do not depend on each other, ask for them in one turn. Preserve raw source values, explain every judgement, and ask the user when the evidence does not settle something rather than guessing. Be concise.`

/**
 * Upgrades persisted copies of a prior default without overwriting unrelated custom prompt
 * text: a sentence that has been superseded is replaced, and the memory paragraph is
 * appended if it is missing entirely. A prompt the user has rewritten keeps everything
 * they wrote — only the parts they left alone are brought forward.
 */
export function enableAppendOnlyTableWrites(prompt: string): string {
  const upgraded = LEGACY_ROW_ACCESS_PROMPTS.reduce((text, legacy) => text.replace(legacy, ROW_ACCESS_PROMPT), prompt)
  return upgraded.includes(MEMORY_PROMPT_MARK) ? upgraded : `${upgraded}\n\n${MEMORY_PROMPT}`
}

export const useAssistantPromptsStore = createLocalListStore<AssistantPrompt>(assistantPromptsTable)
