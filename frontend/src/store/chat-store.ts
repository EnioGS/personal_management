import { create } from 'zustand'
import { requestChatMessage } from '@/lib/openrouter'
import { requestOpenAiChatMessage } from '@/lib/openai-client'
import { DEV_API_KEY, useAssistantConfigStore, type AssistantConfig } from '@/lib/assistant-config'
import { defaultModelForProvider } from '@/lib/assistant-models'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY, enableAppendOnlyTableWrites, useAssistantPromptsStore } from '@/lib/assistant-prompts'
import { formatAttachmentsForPrompt, type ChatAttachment } from '@/lib/chat-attachments'
import type { OpenRouterMessage } from '@/lib/openrouter'
import { toolsForRequest } from '@/lib/tools/registry'
import { runConversation, type ConversationStatus } from '@/lib/tools/run-conversation'
import { toolContext } from '@/lib/tools/tool-context'
import { modelFactsFor } from '@/lib/model-context-window'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import {
  UNTITLED,
  deleteConversation,
  listConversations,
  readConversation,
  renameConversation,
  saveConversation,
} from '@/lib/chat/conversations'
import { useChatPanelStore } from './chat-panel-store'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isError?: boolean
  model?: string
}

export type ChatStatus = { type: 'idle' } | ConversationStatus

/** What the conversation has cost so far, and how much of the model's window it fills. */
export interface ChatUsage {
  /** Tokens for the most recent user message, including every tool-call round it took. */
  lastMessageTokens: number
  /** Rounds the last message needed — one request each. */
  lastMessageRounds: number
  /** Every token this session has spent. */
  sessionTokens: number
  /** The prompt size of the last request: what the next one starts from. */
  contextTokens: number
  /** The model's window, when it could be looked up. */
  contextWindow: number | null
  /** What the session has cost in US dollars, when the model's prices are known. */
  sessionCost: number | null
  /** What the last message cost, on the same terms. */
  lastMessageCost: number | null
  model?: string
}

interface ChatState {
  messages: ChatMessage[]
  attachments: ChatAttachment[]
  isSending: boolean
  status: ChatStatus
  usage: ChatUsage
  /**
   * Messages written while a reply was still coming, waiting their turn. They are already
   * in `messages` — each one its own bubble — and go to the model together when the
   * current exchange finishes.
   */
  queued: string[]
  /** The conversation being written to, or null before its first message is sent. */
  conversationId: number | null
  title: string
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  /** Starts a fresh conversation. Nothing is discarded: the current one is already saved. */
  newConversation: () => void
  openConversation: (id: number) => Promise<void>
  removeConversation: (id: number) => Promise<void>
  /** Loads the conversation last written to, which is what a reload should come back to. */
  restoreLastConversation: () => Promise<void>
  setTitle: (title: string) => Promise<void>
  addAttachment: (attachment: ChatAttachment) => void
  removeAttachment: (id: string) => void
  pushError: (text: string) => void
}

/**
 * Names the conversation from what it opened with.
 *
 * A separate one-shot request with no tools and no history: the title is for the list on
 * the user's screen, not something the assistant has to carry in context for the rest of
 * the conversation. A failure here is silent — an untitled conversation is a small loss,
 * and refusing to send the actual message over it would be a large one.
 */
async function titleFor(connection: AssistantConfig, opening: string): Promise<string | null> {
  try {
    const requestFn = connection.provider === 'openai' ? requestOpenAiChatMessage : requestChatMessage
    const reply = await requestFn(connection.apiKey, connection.model, [
      { role: 'system', content: 'Name this conversation in at most five words. Reply with the name alone: no quotes, no punctuation at the end, no explanation. Use the language the message is written in.' },
      { role: 'user', content: opening.slice(0, 500) },
    ])
    const title = (reply.content ?? '').trim().replace(/^["']|["']$/g, '').slice(0, 60)
    return title || null
  } catch {
    return null
  }
}

/**
 * The connection the chat sends requests to: whichever saved connection is
 * marked active, or — if none has been configured yet — the dev-only
 * OpenRouter key from .env, so a fresh browser profile still works locally.
 */
function activeConnection(): AssistantConfig | null {
  const active = useAssistantConfigStore.getState().items.find((item) => item.isActive)
  if (active) return active
  if (DEV_API_KEY) return { provider: 'openrouter', apiKey: DEV_API_KEY, model: defaultModelForProvider('openrouter'), isActive: true }
  return null
}

export const useChatStore = create<ChatState>((set, get) => {
  /**
   * Sends one exchange, for messages whose bubbles are already on screen.
   *
   * `texts` is what goes to the model as a single user turn — several, when the user
   * wrote while a reply was still coming. The conversation keeps them apart, because
   * that is how they were written and how they will read tomorrow; the model gets them
   * together, because they are one thing said in several breaths and answering each in
   * turn would mean answering the first without the rest.
   */
  async function deliver(texts: string[]): Promise<void> {
    const history = get().messages
    // The bubbles for this turn are already at the end of the history; the model sees
    // everything before them, then the turn itself as one message.
    const priorMessages = history.slice(0, Math.max(0, history.length - texts.length))
    set({ isSending: true, status: { type: 'waiting' } })

    try {
      const connection = activeConnection()
      if (!connection) {
        throw new Error('No API key configured — add one in Settings → Assistant.')
      }

      const promptRow = useAssistantPromptsStore.getState().items.find((item) => item.key === SYSTEM_PROMPT_KEY)
      const savedPrompt = promptRow?.content ?? DEFAULT_SYSTEM_PROMPT
      const systemPrompt = enableAppendOnlyTableWrites(savedPrompt)
      // Existing browser profiles persist their system prompt. Upgrade only the prior
      // read-only sentence in place, leaving the user's other custom instructions intact.
      if (promptRow && systemPrompt !== promptRow.content) {
        void useAssistantPromptsStore.getState().updateItem(promptRow.id, { key: SYSTEM_PROMPT_KEY, content: systemPrompt })
      }
      const attachments = get().attachments

      const apiMessages: OpenRouterMessage[] = [
        { role: 'system', content: systemPrompt + formatAttachmentsForPrompt(attachments) },
        ...priorMessages.map((m) => ({ role: m.role, content: m.content }) as OpenRouterMessage),
        { role: 'user', content: texts.join('\n\n') },
      ]

      const requestFn = connection.provider === 'openai' ? requestOpenAiChatMessage : requestChatMessage
      const sessionTokensBefore = get().usage.sessionTokens
      const sessionCostBefore = get().usage.sessionCost ?? 0
      // The window and the prices are looked up once per model, and never block the
      // request itself; the line simply says less until they arrive.
      const facts = await modelFactsFor(connection.model).catch(() => null)
      set({ usage: { ...get().usage, contextWindow: facts?.contextWindow ?? null, model: connection.model } })
      const replyText = await runConversation({
        apiKey: connection.apiKey,
        model: connection.model,
        messages: apiMessages,
        context: toolContext(attachments),
        tools: toolsForRequest(),
        requestFn,
        onStatus: (status) => set({ status }),
        onUsage: (usage) => {
          const previous = get().usage
          // Prompt and completion tokens are priced differently, so the cost is built
          // from the two rather than from the total.
          const cost = facts?.promptCostPerToken !== null && facts?.completionCostPerToken !== null && facts
            ? usage.promptTokens * facts.promptCostPerToken + usage.completionTokens * facts.completionCostPerToken
            : null
          set({
            usage: {
              ...previous,
              lastMessageTokens: usage.totalTokens,
              lastMessageRounds: usage.rounds,
              lastMessageCost: cost,
              sessionCost: cost === null ? previous.sessionCost : sessionCostBefore + cost,
              // The session total counts each round once, however many rounds a
              // message took, so it keeps rising while a message is still working.
              sessionTokens: sessionTokensBefore + usage.totalTokens,
              contextTokens: usage.lastPromptTokens,
              model: connection.model,
            },
          })
        },
      })
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: replyText,
        model: connection.model,
      }
      set({ messages: [...get().messages, assistantMessage], isSending: false, status: { type: 'idle' } })
      await persist(set, get)
      // A conversation nobody has named takes its name from what it opened with, once.
      if (get().title === UNTITLED) {
        const named = await titleFor(connection, texts[0])
        if (named) await get().setTitle(named)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong talking to the assistant.'
      const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: message, isError: true }
      set({ messages: [...get().messages, errorMessage], isSending: false, status: { type: 'idle' } })
      await persist(set, get)
    }

    if (useChatPanelStore.getState().panelWidth === 0) useChatPanelStore.getState().markUnread()

    // Whatever was written while that was in flight goes now, as one turn.
    const waiting = get().queued
    if (waiting.length > 0) {
      set({ queued: [] })
      await deliver(waiting)
    }
  }

  return {
  messages: [],
  attachments: [],
  isSending: false,
  status: { type: 'idle' },
  usage: { lastMessageTokens: 0, lastMessageRounds: 0, sessionTokens: 0, contextTokens: 0, contextWindow: null, sessionCost: null, lastMessageCost: null },
  queued: [],
  conversationId: null,
  title: UNTITLED,

  sendMessage: async (text) => {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    set({ messages: [...get().messages, userMessage] })
    // Saved the moment it is sent, not when the reply lands: a message that cost the user
    // thought should survive a reply that never arrives.
    await persist(set, get)

    // A reply is still coming: the message waits its turn rather than the user waiting to
    // write it. It is already on screen, so nothing about it is hidden while it waits.
    if (get().isSending) {
      set({ queued: [...get().queued, text] })
      return
    }

    await deliver([text])
  },

  clearMessages: () => set({
    messages: [],
    attachments: [],
    queued: [],
    conversationId: null,
    title: UNTITLED,
    // The window survives a cleared conversation; what it cost does not.
    usage: { ...get().usage, lastMessageTokens: 0, lastMessageRounds: 0, sessionTokens: 0, contextTokens: 0, sessionCost: null, lastMessageCost: null },
  }),

  newConversation: () => get().clearMessages(),

  openConversation: async (id) => {
    const conversation = await readConversation(id)
    if (!conversation) return
    set({
      conversationId: conversation.id,
      title: conversation.title,
      messages: conversation.messages,
      attachments: [],
      queued: [],
      status: { type: 'idle' },
      usage: { ...get().usage, lastMessageTokens: 0, lastMessageRounds: 0, sessionTokens: 0, contextTokens: 0, sessionCost: null, lastMessageCost: null },
    })
  },

  removeConversation: async (id) => {
    await deleteConversation(id)
    // Deleting the one on screen leaves a blank conversation rather than someone else's.
    if (get().conversationId === id) get().clearMessages()
  },

  restoreLastConversation: async () => {
    if (get().messages.length > 0) return
    const [latest] = await listConversations()
    if (latest) await get().openConversation(latest.id)
  },

  setTitle: async (title) => {
    const trimmed = title.trim() || UNTITLED
    set({ title: trimmed })
    const id = get().conversationId
    if (id !== null) await renameConversation(id, trimmed)
  },
  addAttachment: (attachment) => set({ attachments: [...get().attachments, attachment] }),
  removeAttachment: (id) => set({ attachments: get().attachments.filter((a) => a.id !== id) }),
  pushError: (text) => {
    const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: text, isError: true }
    set({ messages: [...get().messages, errorMessage] })
  },
  }
})

/** Writes the conversation as it now stands, remembering the id a first save mints. */
async function persist(set: (partial: Partial<ChatState>) => void, get: () => ChatState) {
  const { conversationId, title, messages } = get()
  const id = await saveConversation(conversationId, { title, messages })
  if (id !== conversationId) set({ conversationId: id })
  await refreshAllLocalStores()
}
