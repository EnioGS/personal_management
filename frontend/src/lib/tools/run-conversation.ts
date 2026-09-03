import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { requestChatMessage, type OpenRouterMessage, type OpenRouterTool } from '@/lib/openrouter'
import { findTool } from './registry'
import type { ToolContext } from './types'

type RequestFn = typeof requestChatMessage

/**
 * How many request/tool-result rounds one message may take before the loop gives up.
 *
 * Labelling work is legitimately long: reading a page of staged rows, checking their
 * provenance, applying labels in batches and validating the result is easily a dozen
 * rounds on its own, and each round may carry several parallel tool calls. The cap
 * exists only to stop a model that has started looping, so it sits well above what
 * real work needs rather than just above the shortest task.
 */
const DEFAULT_MAX_TOOL_ROUNDS = 30

export type ConversationStatus = { type: 'waiting' } | { type: 'tool'; name: string }

/**
 * What one user message cost in total. A tool-call loop sends the whole growing
 * conversation once per round, so the interesting number is the sum of the rounds,
 * and `promptTokens` of the last round is what the next request starts from.
 */
export interface ConversationUsage {
  rounds: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** The prompt size of the final round — the live context this conversation occupies. */
  lastPromptTokens: number
}

export interface RunConversationArgs {
  apiKey: string
  model: string
  messages: OpenRouterMessage[]
  context: ToolContext
  tools?: OpenRouterTool[]
  maxIterations?: number
  requestFn?: RequestFn
  onStatus?: (status: ConversationStatus) => void
  onUsage?: (usage: ConversationUsage) => void
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
  maxIterations = DEFAULT_MAX_TOOL_ROUNDS,
  requestFn = requestChatMessage,
  onStatus,
  onUsage,
}: RunConversationArgs): Promise<string> {
  const conversation = [...messages]
  const usage: ConversationUsage = { rounds: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, lastPromptTokens: 0 }

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    onStatus?.({ type: 'waiting' })
    const message = await requestFn(apiKey, model, conversation, tools)
    if (message.usage) {
      usage.rounds += 1
      usage.promptTokens += message.usage.promptTokens
      usage.completionTokens += message.usage.completionTokens
      usage.totalTokens += message.usage.totalTokens
      usage.lastPromptTokens = message.usage.promptTokens
      onUsage?.({ ...usage })
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      if (typeof message.content !== 'string') throw new Error('Unexpected response from the assistant API.')
      return message.content
    }

    conversation.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls })

    for (const toolCall of message.tool_calls) {
      onStatus?.({ type: 'tool', name: toolCall.function.name })
      const result = await executeToolCall(toolCall, context)
      conversation.push({ role: 'tool', content: result, tool_call_id: toolCall.id })
    }
  }

  throw new Error(`Assistant did not produce a final answer after ${maxIterations} tool-call rounds. Ask it to continue, or narrow the request — for example a page of rows at a time.`)
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

  const result = await tool.execute(args, context)
  // Tools write through the Dexie tables directly, so nothing tells the screens that
  // read them that anything changed: a mapping the assistant assigned, or a label it
  // set, would sit in the database while the panel kept showing what it loaded when it
  // mounted. Re-reading after every call keeps what the user sees and what the
  // assistant just did the same thing, without a reload.
  await refreshAllLocalStores()
  return result
}
