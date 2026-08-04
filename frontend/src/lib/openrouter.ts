export interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface OpenRouterTool {
  type: 'function'
  function: { name: string; description: string; parameters: object }
}

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenRouterToolCall[]
  tool_call_id?: string
}

interface OpenRouterResponseMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: OpenRouterToolCall[]
}

/**
 * Without an explicit cap, OpenRouter reserves credit against the model's own default
 * output budget (which can be very large for some models) before the request even runs —
 * a low-balance key gets a 402 even for a short reply. Capping this keeps behavior
 * consistent regardless of which model is selected.
 */
const MAX_RESPONSE_TOKENS = 4096

/** Sends one request and returns the raw response message — callers decide whether to loop on tool_calls. */
export async function requestChatMessage(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  tools?: OpenRouterTool[],
): Promise<OpenRouterResponseMessage> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: MAX_RESPONSE_TOKENS,
      ...(tools && tools.length > 0 ? { tools } : {}),
    }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenRouter request failed (${response.status}): ${body || response.statusText}`)
  }

  const data: unknown = await response.json()
  const message = (data as { choices?: { message?: OpenRouterResponseMessage }[] })?.choices?.[0]?.message
  if (!message || (typeof message.content !== 'string' && message.content !== null)) {
    throw new Error('Unexpected response from OpenRouter.')
  }
  return message
}

/** Non-streaming chat completion against OpenRouter — https://openrouter.ai/docs. */
export async function sendChatCompletion(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
): Promise<string> {
  const message = await requestChatMessage(apiKey, model, messages)
  if (typeof message.content !== 'string') throw new Error('Unexpected response from OpenRouter.')
  return message.content
}
