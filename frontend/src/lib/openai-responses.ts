import type { OpenRouterMessage, OpenRouterTool, OpenRouterToolCall, TokenUsage } from './openrouter'

/**
 * OpenAI's Responses API, for the models that will not take function tools on chat
 * completions while their reasoning is on.
 *
 * The alternative those models offer is to turn reasoning off, which keeps the tools and
 * loses the thinking — and the work here is labelling other people's money, which is
 * exactly the work that wants thinking. So the wire format changes instead: same
 * conversation, same tools, translated on the way out and back.
 */
const MAX_OUTPUT_TOKENS = 16_000

interface ResponsesOutputItem {
  type: string
  /** For a message: the text parts. */
  content?: { type: string; text?: string }[]
  /** For a function call. */
  call_id?: string
  name?: string
  arguments?: string
}

/** A chat-shaped conversation as Responses input items. */
export function toResponsesInput(messages: OpenRouterMessage[]): unknown[] {
  const input: unknown[] = []

  for (const message of messages) {
    if (message.role === 'tool') {
      // A tool result is an item of its own, tied to the call by id rather than by order.
      input.push({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content ?? '' })
      continue
    }

    if (message.content) input.push({ role: message.role, content: message.content })
    for (const call of message.tool_calls ?? []) {
      input.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments })
    }
  }

  return input
}

/** Tools declared flat here, rather than nested under `function` as chat completions wants. */
export function toResponsesTools(tools: OpenRouterTool[]): unknown[] {
  return tools.map((tool) => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }))
}

/** The reply, read back into the one shape the rest of the app knows. */
export function fromResponsesOutput(data: unknown): { role: 'assistant'; content: string | null; tool_calls?: OpenRouterToolCall[]; usage?: TokenUsage } {
  const output = ((data as { output?: ResponsesOutputItem[] })?.output ?? [])
  const text = output
    .filter((item) => item.type === 'message')
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === 'output_text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('')

  const toolCalls: OpenRouterToolCall[] = output
    .filter((item) => item.type === 'function_call' && item.call_id && item.name)
    .map((item) => ({
      id: item.call_id as string,
      type: 'function',
      function: { name: item.name as string, arguments: item.arguments ?? '{}' },
    }))

  const usage = (data as { usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } })?.usage
  return {
    role: 'assistant',
    content: text || null,
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    ...(usage && typeof usage.total_tokens === 'number'
      ? { usage: { promptTokens: usage.input_tokens ?? 0, completionTokens: usage.output_tokens ?? 0, totalTokens: usage.total_tokens } }
      : {}),
  }
}

export async function requestOpenAiResponse(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  tools?: OpenRouterTool[],
): Promise<ReturnType<typeof fromResponsesOutput>> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: toResponsesInput(messages),
      max_output_tokens: MAX_OUTPUT_TOKENS,
      ...(tools && tools.length > 0 ? { tools: toResponsesTools(tools) } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenAI request failed (${response.status}): ${body || response.statusText}`)
  }

  const data: unknown = await response.json()
  const message = fromResponsesOutput(data)
  if (message.content === null && !message.tool_calls) {
    const status = (data as { status?: string })?.status
    throw new Error(`The model returned nothing${status ? ` (${status})` : ''}. It may have reached its output limit before answering.`)
  }
  return message
}
