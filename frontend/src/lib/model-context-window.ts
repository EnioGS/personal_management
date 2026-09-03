/**
 * How much context the selected model has.
 *
 * A completion response does not carry it — the API reports what a request cost,
 * never what the model can hold — so it is fetched once per session from
 * OpenRouter's public models endpoint (no key required) and cached. When that call
 * fails, or the model is not listed (an OpenAI-direct model id, say), the caller
 * shows token counts and states that the window is unknown rather than guessing a
 * number the user might trust.
 */
const cache = new Map<string, number | null>()
let allModels: Promise<Map<string, number>> | null = null

async function loadModelWindows(): Promise<Map<string, number>> {
  const response = await fetch('https://openrouter.ai/api/v1/models')
  if (!response.ok) throw new Error(`models request failed (${response.status})`)
  const data = (await response.json()) as { data?: { id?: string; context_length?: number }[] }
  const windows = new Map<string, number>()
  for (const model of data.data ?? []) {
    if (typeof model.id === 'string' && typeof model.context_length === 'number') windows.set(model.id, model.context_length)
  }
  return windows
}

export async function contextWindowFor(model: string): Promise<number | null> {
  if (cache.has(model)) return cache.get(model) ?? null
  try {
    allModels ??= loadModelWindows()
    const windows = await allModels
    // An OpenAI-direct id (gpt-5.6) is listed by OpenRouter under a provider prefix.
    const window = windows.get(model) ?? windows.get(`openai/${model}`) ?? null
    cache.set(model, window)
    return window
  } catch {
    // A failed lookup is cached as unknown for this model only, so selecting another
    // model tries again rather than the whole session giving up on one network blip.
    cache.set(model, null)
    allModels = null
    return null
  }
}
