import type { ApiProvider } from './ai-providers'
import rawModels from './assistant-models.json'

export interface AssistantModelOption {
  id: string
  provider: string
}

export const assistantModels: AssistantModelOption[] = rawModels

export interface AssistantModelGroup {
  provider: string
  models: AssistantModelOption[]
}

export function groupAssistantModelsByProvider(models: AssistantModelOption[] = assistantModels): AssistantModelGroup[] {
  const groups: AssistantModelGroup[] = []
  const groupByProvider = new Map<string, AssistantModelGroup>()

  for (const model of models) {
    let group = groupByProvider.get(model.provider)
    if (!group) {
      group = { provider: model.provider, models: [] }
      groupByProvider.set(model.provider, group)
      groups.push(group)
    }
    group.models.push(model)
  }

  return groups
}

/**
 * OpenRouter routes to every vendor under its own namespaced ids (e.g.
 * "openai/gpt-5.5") — a connection to it can pick from the full catalog as-is.
 * A direct OpenAI connection can only run OpenAI's own models, and OpenAI's API
 * expects the bare id with no "openai/" prefix.
 */
export function assistantModelsForProvider(provider: ApiProvider): AssistantModelOption[] {
  if (provider === 'openrouter') return assistantModels
  return assistantModels
    .filter((model) => model.provider === 'OpenAI')
    .map((model) => ({ ...model, id: model.id.replace(/^openai\//, '') }))
}

export function defaultModelForProvider(provider: ApiProvider): string {
  return assistantModelsForProvider(provider)[0]?.id ?? ''
}
