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
export interface ModelFacts {
  contextWindow: number | null
  /** US dollars per prompt token and per completion token, as the catalogue lists them. */
  promptCostPerToken: number | null
  completionCostPerToken: number | null
}

const UNKNOWN: ModelFacts = { contextWindow: null, promptCostPerToken: null, completionCostPerToken: null }

const cache = new Map<string, ModelFacts>()
let allModels: Promise<Map<string, ModelFacts>> | null = null

function price(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN
  return Number.isFinite(parsed) ? parsed : null
}

async function loadModelFacts(): Promise<Map<string, ModelFacts>> {
  const response = await fetch('https://openrouter.ai/api/v1/models')
  if (!response.ok) throw new Error(`models request failed (${response.status})`)
  const data = (await response.json()) as { data?: { id?: string; context_length?: number; pricing?: { prompt?: string; completion?: string } }[] }
  const facts = new Map<string, ModelFacts>()
  for (const model of data.data ?? []) {
    if (typeof model.id !== 'string') continue
    facts.set(model.id, {
      contextWindow: typeof model.context_length === 'number' ? model.context_length : null,
      promptCostPerToken: price(model.pricing?.prompt),
      completionCostPerToken: price(model.pricing?.completion),
    })
  }
  return facts
}

/** The window and the prices for one model, or nulls when the catalogue does not list it. */
export async function modelFactsFor(model: string): Promise<ModelFacts> {
  const cached = cache.get(model)
  if (cached) return cached
  try {
    allModels ??= loadModelFacts()
    const facts = await allModels
    // An OpenAI-direct id (gpt-5.6) is listed by OpenRouter under a provider prefix.
    const found = facts.get(model) ?? facts.get(`openai/${model}`) ?? UNKNOWN
    cache.set(model, found)
    return found
  } catch {
    // A failed lookup is cached for this model only, so selecting another model tries
    // again rather than the whole session giving up on one network blip.
    cache.set(model, UNKNOWN)
    allModels = null
    return UNKNOWN
  }
}
