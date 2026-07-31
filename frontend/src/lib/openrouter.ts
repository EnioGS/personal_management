export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/** Non-streaming chat completion against OpenRouter — https://openrouter.ai/docs. */
export async function sendChatCompletion(
  apiKey: string,
  model: string,
  messages: OpenRouterMessage[],
): Promise<string> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages }),
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`OpenRouter request failed (${response.status}): ${body || response.statusText}`)
  }

  const data: unknown = await response.json()
  const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content
  if (typeof content !== 'string') throw new Error('Unexpected response from OpenRouter.')
  return content
}
