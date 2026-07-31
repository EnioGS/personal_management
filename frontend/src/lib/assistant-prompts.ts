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
export const DEFAULT_SYSTEM_PROMPT = `You are the assistant built into Personal Management, a local-first personal finance and notes app. Everything the user tells you stays on their device — there is no backend. You can call tools to help answer questions; right now that includes reading the text content of files the user has attached to this conversation. You do not yet have access to the user's stored finance/investment/notes data. Be concise and helpful.`

export const useAssistantPromptsStore = createEncryptedListStore<AssistantPrompt>(assistantPromptsTable)
