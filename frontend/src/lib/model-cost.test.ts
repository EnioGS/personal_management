import { describe, expect, it } from 'vitest'
import { costOfExchange } from './model-cost'

const facts = { contextWindow: 400_000, promptCostPerToken: 0.000001, completionCostPerToken: 0.00001, cachedPromptCostPerToken: 0.0000001 }

describe('what an exchange cost', () => {
  it('charges the cache at the cache rate, which is most of a long tool loop', () => {
    // 200k prompt tokens, 160k of them cached, 4k written back.
    const cost = costOfExchange({ promptTokens: 200_000, cachedTokens: 160_000, completionTokens: 4_000 }, facts)

    // 40k fresh at 1e-6, 160k cached at 1e-7, 4k completion at 1e-5.
    expect(cost).toBeCloseTo(0.04 + 0.016 + 0.04, 6)
  })

  it('falls back to the fresh rate when the catalogue does not price the cache', () => {
    const silent = { ...facts, cachedPromptCostPerToken: null }

    expect(costOfExchange({ promptTokens: 1000, cachedTokens: 800, completionTokens: 0 }, silent)).toBeCloseTo(0.001, 6)
  })

  it('is the old arithmetic when nothing was cached', () => {
    expect(costOfExchange({ promptTokens: 1000, cachedTokens: 0, completionTokens: 100 }, facts)).toBeCloseTo(0.001 + 0.001, 6)
  })

  it('never counts more cached tokens than there were prompt tokens', () => {
    expect(costOfExchange({ promptTokens: 100, cachedTokens: 500, completionTokens: 0 }, facts)).toBeCloseTo(500 * 0.0000001, 8)
  })
})
