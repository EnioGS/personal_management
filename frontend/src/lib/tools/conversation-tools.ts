import { useChatStore } from '@/store/chat-store'
import type { ToolDefinition } from './types'

export const setConversationTitleTool: ToolDefinition = {
  name: 'set_conversation_title',
  description: "Renames the conversation on screen. It is named automatically from its opening message, so use this only when the user asks for a different name — not on your own initiative, and not because the subject drifted. Keep it short: it is a line in a list, not a summary.",
  parameters: {
    type: 'object',
    properties: { title: { type: 'string', description: 'At most a few words.' } },
    required: ['title'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.title !== 'string' || !args.title.trim()) return 'Error: a title is required.'
    const title = args.title.trim().slice(0, 60)
    await useChatStore.getState().setTitle(title)
    return JSON.stringify({ title })
  },
}
