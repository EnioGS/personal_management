import { describe, expect, it } from 'vitest'
import { assistantModels, assistantModelsForProvider, defaultModelForProvider } from './assistant-models'

describe('assistantModelsForProvider', () => {
  it('returns the full OpenRouter-namespaced catalog for openrouter', () => {
    expect(assistantModelsForProvider('openrouter')).toEqual(assistantModels)
  })

  it('returns only OpenAI models, stripped of the "openai/" prefix, for openai', () => {
    const models = assistantModelsForProvider('openai')
    expect(models.length).toBeGreaterThan(0)
    for (const model of models) {
      expect(model.provider).toBe('OpenAI')
      expect(model.id.startsWith('openai/')).toBe(false)
    }
  })
})

describe('defaultModelForProvider', () => {
  it('picks the first model in each provider-scoped list', () => {
    expect(defaultModelForProvider('openrouter')).toBe(assistantModels[0].id)
    expect(defaultModelForProvider('openai')).toBe(assistantModelsForProvider('openai')[0].id)
  })
})
