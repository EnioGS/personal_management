import type { ChatAttachment } from '@/lib/chat-attachments'

/** Threaded through every tool's execute() — future tools extend this (e.g. store accessors) without an architecture change. */
export interface ToolContext {
  attachments: ChatAttachment[]
  /**
   * Resolves an i18next key. Tools that deal with the app's own sections and screens
   * need their current names — what a label may be called changes with the language,
   * and neither the tools nor the model should keep a copy of it.
   */
  translate: (key: string) => string
}

export interface ToolDefinition {
  name: string
  description: string
  /** JSON Schema, passed through verbatim to OpenRouter's function.parameters. */
  parameters: object
  /**
   * Never throws — a `role:"tool"` message always needs string content, so errors
   * (bad args, not found, etc.) are returned as the result string, not thrown.
   */
  execute: (args: Record<string, unknown>, context: ToolContext) => Promise<string>
}
