import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import type { ChatMessage } from '@/store/chat-store'
import { conversationsTable } from './conversations-db'

/** What a conversation is called before anyone — or the assistant — has named it. */
export const UNTITLED = 'untitled'

/** What a conversation cost, kept with it so reopening one continues its own count. */
export interface ConversationUsage {
  tokens: number
  requests: number
  cost: number | null
  /** The prompt size of its last request: what the next one would start from. */
  contextTokens: number
  contextWindow: number | null
  model?: string
}

export interface Conversation {
  title: string
  messages: ChatMessage[]
  /** When the last message was written, which is what "the last conversation" means. */
  updatedAt: number
  usage?: ConversationUsage
}

export type StoredConversation = Conversation & { id: number }

/** Most recently written first: the list reads as "what I was last talking about". */
export async function listConversations(): Promise<StoredConversation[]> {
  const rows = await conversationsTable.toArray()
  return rows
    .map((row) => ({ id: row.id, ...(row.data as Conversation) }))
    .sort((left, right) => right.updatedAt - left.updatedAt)
}

export async function readConversation(id: number): Promise<StoredConversation | undefined> {
  const stored = await conversationsTable.get(id)
  return stored ? { id: stored.id, ...(stored.data as Conversation) } : undefined
}

/**
 * Writes the conversation as it stands.
 *
 * Called after every message in either direction, so there is nothing to save by hand and
 * nothing to lose by closing the tab. An empty conversation is never written: a panel
 * opened and closed again should leave no trace in the list.
 */
export async function saveConversation(id: number | null, conversation: Omit<Conversation, 'updatedAt'>): Promise<number | null> {
  if (conversation.messages.length === 0) return id
  const data: Conversation = { ...conversation, updatedAt: Date.now() }

  if (id === null) return conversationsTable.add({ createdAt: Date.now(), data })
  const existing = await conversationsTable.get(id)
  if (!existing) return conversationsTable.add({ createdAt: Date.now(), data })
  await conversationsTable.update(id, { data })
  return id
}

export async function renameConversation(id: number, title: string): Promise<void> {
  const stored = await conversationsTable.get(id)
  if (!stored) return
  await conversationsTable.update(id, { data: { ...(stored.data as Conversation), title: title.trim() || UNTITLED } })
  await refreshAllLocalStores()
}

/** Permanent: the list is the storage, so leaving it is leaving the database. */
export async function deleteConversation(id: number): Promise<void> {
  await conversationsTable.delete(id)
  await refreshAllLocalStores()
}
