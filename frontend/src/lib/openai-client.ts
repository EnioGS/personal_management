import { readUsage, type OpenRouterMessage, type OpenRouterTool, type OpenRouterToolCall, type TokenUsage } from './openrouter'

interface OpenAiResponseMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: OpenRouterToolCall[]
  usage?: TokenUsage
}

const MAX_RESPONSE_TOKENS = 4096

type Adjustments = { limitField: 'max_completion_tokens' | 'max_tokens'; withoutReasoning: boolean }

/** Each refusal this client knows how to answer, and what it changes in response. */
const RETRIES: { when: (body: string) => boolean; change: (current: Adjustments) => Adjustments }[] = [
  {
    // Older models, and some OpenAI-compatible proxies, know only the old name.
    when: (body) => body.includes('max_completion_tokens'),
    change: (current) => Object.assign(current, { limitField: 'max_tokens' as const }),
  },
  {
    // Some models will not take function tools on chat completions while reasoning is on.
    // Answering with what the API itself suggests keeps the tools, which are the point.
    when: (body) => body.includes('reasoning_effort'),
    change: (current) => Object.assign(current, { withoutReasoning: true }),
  },
]

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
  /**
   * What this request is allowed to say, adjusted as the API tells us it cannot.
   *
   * Which parameters a model accepts is not something a client can know in advance —
   * OpenAI has renamed the length limit, and some models refuse function tools unless
   * reasoning is switched off, both of which vary by model and change over time. So the
   * request is sent as it should be, and each specific refusal is answered by changing
   * the one thing it named. Keeping a table of which model wants what would be wrong
   * again within a month.
   */
  const send = (adjust: { limitField: 'max_completion_tokens' | 'max_tokens'; withoutReasoning: boolean }) =>
    fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        [adjust.limitField]: MAX_RESPONSE_TOKENS,
        ...(tools && tools.length > 0 ? { tools } : {}),
        // Said only when the model has refused tools without it: it turns the model's
        // own reasoning off, which is a real loss and not something to volunteer.
        ...(adjust.withoutReasoning ? { reasoning_effort: 'none' } : {}),
      }),
    })

  const adjust = { limitField: 'max_completion_tokens' as const, withoutReasoning: false }
  let response = await send(adjust)
  let body = response.ok ? '' : await response.text().catch(() => '')

  for (const retry of RETRIES) {
    if (response.ok || !retry.when(body)) continue
    response = await send(retry.change(adjust))
    body = response.ok ? '' : await response.text().catch(() => '')
  }

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${body || response.statusText}`)
  }

  const data: unknown = await response.json()
  const message = (data as { choices?: { message?: OpenAiResponseMessage }[] })?.choices?.[0]?.message
  if (!message || (typeof message.content !== 'string' && message.content !== null)) {
    throw new Error('Unexpected response from OpenAI.')
  }
  return { ...message, usage: readUsage(data) }
}
