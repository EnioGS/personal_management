import { useCategoryRulesStore } from '@/lib/model/model-stores'
import type { ToolDefinition } from './types'

export const deleteCategoryRuleTool: ToolDefinition = {
  name: 'delete_category_rule',
  description:
    'Deletes a normalization rule. Ask the user for confirmation before doing this operation since it is destructive. ' +
    'The category remains, but raw values previously matched by this rule may become unmatched. Use the rule id ' +
    'from the category settings or another tool result.',
  parameters: {
    type: 'object',
    properties: {
      ruleId: { type: 'number', description: 'The normalization rule id to delete.' },
      confirmed: { type: 'boolean', description: 'Must be true only after the user explicitly confirms deletion.' },
    },
    required: ['ruleId', 'confirmed'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.ruleId !== 'number' || !Number.isInteger(args.ruleId)) return 'Error: "ruleId" must be an integer.'
    if (args.confirmed !== true) return 'Error: user confirmation is required before deleting a normalization rule.'

    const store = useCategoryRulesStore.getState()
    if (!store.items.some((rule) => rule.id === args.ruleId)) return `Error: normalization rule ${args.ruleId} was not found.`
    await store.deleteItem(args.ruleId)
    return `Deleted normalization rule ${args.ruleId}.`
  },
}
