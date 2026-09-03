import i18n from '@/i18n'
import type { ChatAttachment } from '@/lib/chat-attachments'
import type { ToolContext } from './types'

/** The context tools run with: the conversation's attachments, and the app's language. */
export function toolContext(attachments: ChatAttachment[]): ToolContext {
  return { attachments, translate: (key: string) => String(i18n.t(key as never)) }
}
