import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { requestChatMessage, type OpenRouterMessage, type OpenRouterTool } from '@/lib/openrouter'
import { findTool, openToolsetTool, toolsForRequest } from './registry'
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
 *
 * Raised from thirty after a twenty-step request hit it and lost the whole message: a
 * model that batches its calls needs few rounds, and one that does not needs one per
 * step — the cap has to clear the second kind, or it is a cap on the model rather than
 * on looping.
 */
const DEFAULT_MAX_TOOL_ROUNDS = 80

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
  /** Prompt tokens the provider served from cache, and completion tokens spent thinking. */
  cachedTokens: number
  reasoningTokens: number
  /** The largest prompt any one round carried: what the context window is measured against. */
  peakPromptTokens: number
  /** Wall clock, in milliseconds: what waiting for this message actually felt like. */
  elapsedMs: number
  /** Of that, the part spent inside tools rather than waiting on the model. */
  toolMs: number
  /** How many tool calls were made, and how many of them came back saying Error. */
  toolCalls: number
  toolErrors: number
  /** Each tool by name, so a wording can be judged by what it made the model reach for. */
  tools: Record<string, { calls: number; errors: number; ms: number }>
  /** Tool sets opened, which is what progressive disclosure costs and saves. */
  toolsetsOpened: number
  /** Characters the model wrote back, which is verbosity measured without a tokenizer. */
  replyChars: number
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
  /** Sets of tools this conversation has already opened, from an earlier message. */
  openGroups?: string[]
  /** Told when a set is opened, so the conversation can remember it. */
  onGroupsOpened?: (groups: string[]) => void
}

/** The sets an open_toolset result says are now available. */
function groupsOpenedBy(result: string): string[] {
  try {
    const parsed: unknown = JSON.parse(result)
    const opened = (parsed as { opened?: unknown })?.opened
    return Array.isArray(opened) ? opened.map(String) : []
  } catch {
    return []
  }
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
  openGroups = [],
  onGroupsOpened,
}: RunConversationArgs): Promise<string> {
  const conversation = [...messages]
  // Which sets of tools this exchange has opened. A request carries the core plus these,
  // so opening one costs a round and then nothing.
  const opened = new Set(openGroups)
  let offered = tools
  const usage: ConversationUsage = {
    rounds: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, lastPromptTokens: 0,
    cachedTokens: 0, reasoningTokens: 0, peakPromptTokens: 0, elapsedMs: 0, toolMs: 0,
    toolCalls: 0, toolErrors: 0, tools: {}, toolsetsOpened: 0, replyChars: 0,
  }
  const startedAt = Date.now()

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    onStatus?.({ type: 'waiting' })
    const message = await requestFn(apiKey, model, conversation, offered)
    if (message.usage) {
      usage.rounds += 1
      usage.promptTokens += message.usage.promptTokens
      usage.completionTokens += message.usage.completionTokens
      usage.totalTokens += message.usage.totalTokens
      usage.lastPromptTokens = message.usage.promptTokens
      usage.cachedTokens += message.usage.cachedTokens ?? 0
      usage.reasoningTokens += message.usage.reasoningTokens ?? 0
      usage.peakPromptTokens = Math.max(usage.peakPromptTokens, message.usage.promptTokens)
      usage.elapsedMs = Date.now() - startedAt
      onUsage?.({ ...usage })
    }

    if (!message.tool_calls || message.tool_calls.length === 0) {
      if (typeof message.content !== 'string') throw new Error('Unexpected response from the assistant API.')
      usage.replyChars = message.content.length
      usage.elapsedMs = Date.now() - startedAt
      // Only when the API said what anything cost: a provider that reports no usage is
      // told about as nothing, not as a message that spent zero.
      if (usage.rounds > 0) onUsage?.({ ...usage })
      return message.content
    }

    conversation.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls })

    for (const toolCall of message.tool_calls) {
      onStatus?.({ type: 'tool', name: toolCall.function.name })
      const calledAt = Date.now()
      const result = await executeToolCall(toolCall, context)
      const took = Date.now() - calledAt

      // Counted by name: which tools a wording makes the model reach for, how often it is
      // refused, and where the waiting goes, are all questions about the wording.
      const name = toolCall.function.name
      const failed = result.startsWith('Error:')
      const tally = usage.tools[name] ?? { calls: 0, errors: 0, ms: 0 }
      usage.tools[name] = { calls: tally.calls + 1, errors: tally.errors + (failed ? 1 : 0), ms: tally.ms + took }
      usage.toolCalls += 1
      usage.toolErrors += failed ? 1 : 0
      usage.toolMs += took

      conversation.push({ role: 'tool', content: result, tool_call_id: toolCall.id })

      // Opening a set takes effect from the next round, and is remembered by the caller
      // so the rest of the conversation does not have to ask again.
      if (toolCall.function.name === openToolsetTool.name) {
        for (const group of groupsOpenedBy(result)) { if (!opened.has(group)) usage.toolsetsOpened += 1; opened.add(group) }
        offered = toolsForRequest([...opened])
        onGroupsOpened?.([...opened])
      }
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
