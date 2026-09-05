import { requestOpenAiResponse } from './openai-responses'
import { readUsage, type OpenRouterMessage, type OpenRouterTool, type OpenRouterToolCall, type TokenUsage } from './openrouter'

interface OpenAiResponseMessage {
  role: 'assistant'
  content: string | null
  tool_calls?: OpenRouterToolCall[]
  usage?: TokenUsage
}

/**
 * How much the model may write back.
 *
 * A reasoning model spends this budget on its thinking as well as its answer, so a cap
 * sized for plain replies cuts it off mid-thought — which arrives as a truncated message
 * rather than as an error, and reads like a model that gave up halfway.
 */
const MAX_RESPONSE_TOKENS = 16_000

type Adjustments = { limitField: 'max_completion_tokens' | 'max_tokens'; withoutReasoning: boolean }

/** Each refusal this client knows how to answer, and what it changes in response. */
const RETRIES: { when: (body: string) => boolean; change: (current: Adjustments) => Adjustments }[] = [
  {
    // Older models, and some OpenAI-compatible proxies, know only the old name.
    when: (body) => body.includes('max_completion_tokens'),
    change: (current) => Object.assign(current, { limitField: 'max_tokens' as const }),
  },
  {
    // A model that refuses tools alongside reasoning without offering the Responses API:
    // its own suggestion is all there is, so take it.
    when: (body) => body.includes('reasoning_effort') && !body.includes('/v1/responses'),
    change: (current) => Object.assign(current, { withoutReasoning: true }),
  },
]

/**
 * The refusal that means this model cannot do tools here at all.
 *
 * Its own suggestion is to turn reasoning off — which keeps the tools and loses the
 * thinking, on work that is entirely thinking. The other suggestion is the Responses API,
 * where the model keeps both, so that is where the request goes instead.
 */
function needsResponsesApi(body: string): boolean {
  return body.includes('reasoning_effort') && body.includes('/v1/responses')
}

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

  if (!response.ok && needsResponsesApi(body)) return requestOpenAiResponse(apiKey, model, messages, tools)

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${body || response.statusText}`)
  }

  const data: unknown = await response.json()
  const choice = (data as { choices?: { message?: OpenAiResponseMessage; finish_reason?: string }[] })?.choices?.[0]
  const message = choice?.message
  if (!message || (typeof message.content !== 'string' && message.content !== null)) {
    throw new Error('Unexpected response from OpenAI.')
  }
  // Said out loud rather than returned as a half-answer: a reply cut off at the budget is
  // indistinguishable from a model that simply stopped, and the two need different fixes.
  if (choice.finish_reason === 'length' && !message.tool_calls?.length) {
    throw new Error(`The model reached its ${MAX_RESPONSE_TOKENS}-token limit before finishing. Ask for less at once, or raise the limit.`)
  }
  return { ...message, usage: readUsage(data) }
}
