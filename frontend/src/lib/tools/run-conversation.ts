import { requestChatMessage, type OpenRouterMessage, type OpenRouterTool } from '@/lib/openrouter'
import { findTool } from './registry'
import type { ToolContext } from './types'

type RequestFn = typeof requestChatMessage

export interface RunConversationArgs {
  apiKey: string
  model: string
  messages: OpenRouterMessage[]
  context: ToolContext
  tools?: OpenRouterTool[]
  maxIterations?: number
  requestFn?: RequestFn
}

/**
 * Drives the request/tool-call/tool-result loop until the model returns a plain-text
 * answer. Kept outside Zustand/React so it's testable with a stubbed `requestFn`.
 */
export async function runConversation({
  apiKey,
  model,
  messages,
  context,
  tools,
  maxIterations = 5,
  requestFn = requestChatMessage,
}: RunConversationArgs): Promise<string> {
  const conversation = [...messages]

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const message = await requestFn(apiKey, model, conversation, tools)

    if (!message.tool_calls || message.tool_calls.length === 0) {
      if (typeof message.content !== 'string') throw new Error('Unexpected response from OpenRouter.')
      return message.content
    }

    conversation.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls })

    for (const toolCall of message.tool_calls) {
      const result = await executeToolCall(toolCall, context)
      conversation.push({ role: 'tool', content: result, tool_call_id: toolCall.id })
    }
  }

  throw new Error(`Assistant did not produce a final answer after ${maxIterations} tool-call rounds.`)
}

async function executeToolCall(
  toolCall: { id: string; function: { name: string; arguments: string } },
  context: ToolContext,
): Promise<string> {
  const tool = findTool(toolCall.function.name)
  if (!tool) return `Error: unknown tool "${toolCall.function.name}".`

  let args: Record<string, unknown>
  try {
    args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
  } catch {
    return `Error: could not parse arguments for "${toolCall.function.name}" as JSON.`
  }

  return tool.execute(args, context)
}
