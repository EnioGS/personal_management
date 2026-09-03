import { readUsage, type OpenRouterMessage, type OpenRouterTool, type OpenRouterToolCall, type TokenUsage } from './openrouter'

interface OpenAiResponseMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: OpenRouterToolCall[]
  usage?: TokenUsage
}

const MAX_RESPONSE_TOKENS = 4096

/**
 * Same OpenAI-compatible chat-completions wire format as lib/openrouter.ts's
 * client, sent straight to OpenAI's own API instead of through OpenRouter —
 * for users who'd rather use an OpenAI key directly. See lib/ai-providers.ts
 * for how a connection is classified as this provider.
 */
export async function requestOpenAiChatMessage(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
  tools?: OpenRouterTool[],
): Promise<OpenAiResponseMessage> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
    throw new Error(`OpenAI request failed (${response.status}): ${body || response.statusText}`)
  }

  const data: unknown = await response.json()
  const message = (data as { choices?: { message?: OpenAiResponseMessage }[] })?.choices?.[0]?.message
  if (!message || (typeof message.content !== 'string' && message.content !== null)) {
    throw new Error('Unexpected response from OpenAI.')
  }
  return { ...message, usage: readUsage(data) }
}
