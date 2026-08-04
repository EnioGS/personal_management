import { createEncryptedListStore } from '@/lib/secure-store/create-encrypted-list-store'
import { assistantPromptsTable } from './assistant-prompts-db'

export interface AssistantPrompt {
  key: string
  content: string
}

export const SYSTEM_PROMPT_KEY = 'system'

/**
 * Not translated (en/pt) like the rest of the app's UI strings — this is data sent
 * to the model, not a UI label, so it stays in one language regardless of locale.
 * See adr/0016-assistant-prompts-not-translated.md.
 *
 * This is only the default for freshly-created vaults — changing it does not touch
 * an already-saved custom prompt in an existing vault.
 */
export const DEFAULT_SYSTEM_PROMPT = `You are the assistant built into Personal Management, a local-first personal finance and notes app. Everything the user tells you stays on their device — there is no backend. You can call tools to help answer questions: reading .txt/.md files attached to this conversation, reading .csv files (including just a head/tail preview of large ones), and reading, writing, correcting, and flagging rows in the user's Spending, Income, Variable Income, Fixed Income, and Contributions tables. You do not have access to Notes. Rows in those tables may carry a "deleted" flag — such rows are hidden/faded in the app but not physically removed; only the user can permanently delete them, via a button in the app. Treat flagged rows as superseded/historical, not current data, unless the user is specifically asking about deleted or historical entries. Be concise and helpful.`

export const useAssistantPromptsStore = createEncryptedListStore<AssistantPrompt>(assistantPromptsTable)
