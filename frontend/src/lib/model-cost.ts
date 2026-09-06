import type { ModelFacts } from './model-context-window'

/**
 * What an exchange cost, with the cache priced as the provider prices it.
 *
 * A tool loop re-sends its whole prompt every round, and a provider that caches charges a
 * fraction for the part it has seen before — so counting every prompt token at the fresh
 * rate does not overstate a long message by a little, it overstates it several times over.
 * Worse, it overstates it *unevenly*: a long, stable system prompt caches better, so the
 * naive figure penalises exactly the wording that is cheaper to run.
 *
 * Where the catalogue is silent about the cache, the fresh rate stands and the figure is
 * an upper bound rather than a guess.
 */
export function costOfExchange(
  usage: { promptTokens: number; cachedTokens: number; completionTokens: number },
  facts: Pick<ModelFacts, 'promptCostPerToken' | 'completionCostPerToken' | 'cachedPromptCostPerToken'>,
): number {
  const fresh = Math.max(0, usage.promptTokens - usage.cachedTokens)
  const cachedRate = facts.cachedPromptCostPerToken ?? facts.promptCostPerToken ?? 0
  return fresh * (facts.promptCostPerToken ?? 0)
    + usage.cachedTokens * cachedRate
    + usage.completionTokens * (facts.completionCostPerToken ?? 0)
}
