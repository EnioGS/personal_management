import rawModels from './assistant-models.json'

export interface AssistantModelOption {
  id: string
  provider: string
}

/**
 * The list shown in Settings → Assistant's model picker. Edit assistant-models.json
 * directly to add/remove models — nothing else needs to change.
 */
export const assistantModels: AssistantModelOption[] = rawModels

export interface AssistantModelGroup {
  provider: string
  models: AssistantModelOption[]
}

/** Groups by provider, preserving each provider's first-appearance order in the JSON file. */
export function groupAssistantModelsByProvider(): AssistantModelGroup[] {
  const groups: AssistantModelGroup[] = []
  const groupByProvider = new Map<string, AssistantModelGroup>()

  for (const model of assistantModels) {
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
