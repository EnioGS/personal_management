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
import { modelFactsFor } from '@/lib/model-context-window'
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
  sendMessage: (text: string) => Promise<void>
  clearMessages: () => void
  addAttachment: (attachment: ChatAttachment) => void
  removeAttachment: (id: string) => void
  pushError: (text: string) => void
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

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  attachments: [],
  isSending: false,
  status: { type: 'idle' },
  usage: { lastMessageTokens: 0, lastMessageRounds: 0, sessionTokens: 0, contextTokens: 0, contextWindow: null, sessionCost: null, lastMessageCost: null },

  sendMessage: async (text) => {
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
    const priorMessages = get().messages
    set({ messages: [...priorMessages, userMessage], isSending: true, status: { type: 'waiting' } })

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
        ...[...priorMessages, userMessage].map((m) => ({ role: m.role, content: m.content }) as OpenRouterMessage),
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
        context: { attachments },
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong talking to the assistant.'
      const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: message, isError: true }
      set({ messages: [...get().messages, errorMessage], isSending: false, status: { type: 'idle' } })
    }

    if (useChatPanelStore.getState().panelWidth === 0) useChatPanelStore.getState().markUnread()
  },

  clearMessages: () => set({
    messages: [],
    attachments: [],
    // The window survives a cleared conversation; what it cost does not.
    usage: { ...get().usage, lastMessageTokens: 0, lastMessageRounds: 0, sessionTokens: 0, contextTokens: 0, sessionCost: null, lastMessageCost: null },
  }),
  addAttachment: (attachment) => set({ attachments: [...get().attachments, attachment] }),
  removeAttachment: (id) => set({ attachments: get().attachments.filter((a) => a.id !== id) }),
  pushError: (text) => {
    const errorMessage: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: text, isError: true }
    set({ messages: [...get().messages, errorMessage] })
  },
}))
