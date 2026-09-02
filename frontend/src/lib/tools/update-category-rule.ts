import { useCategoriesStore, useCategoryRulesStore } from '@/lib/model/model-stores'
import type { CategoryRule } from '@/lib/model/types'
import type { ToolDefinition } from './types'

export const updateCategoryRuleTool: ToolDefinition = {
  name: 'update_category_rule',
  description:
    'Edits an existing normalization rule. First call read_category_raw_values, or use a rule ID the user supplied, ' +
    'so you update the intended rule. You may change its matchString, destination categoryName (an existing category), ' +
    'or priority. Lower priorities run first and the first matching rule wins. Match-string edits are always ' +
    'case-insensitive substring matches. Editing a rule reclassifies values at read time and does not change row data.',
  parameters: {
    type: 'object',
    properties: {
      ruleId: { type: 'number', description: 'The normalization rule id.' },
      matchString: { type: 'string', description: 'New case-insensitive substring. Omit to keep the current one.' },
      categoryName: { type: 'string', description: 'Existing destination category name. Omit to keep the current category.' },
      priority: { type: 'number', description: 'New zero-based priority; lower numbers run first.' },
    },
    required: ['ruleId'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.ruleId !== 'number' || !Number.isInteger(args.ruleId)) return 'Error: "ruleId" must be an integer.'

    const rulesStore = useCategoryRulesStore.getState()
    const current = rulesStore.items.find((rule) => rule.id === args.ruleId)
    if (!current) return `Error: normalization rule ${args.ruleId} was not found.`

    const hasMatchString = Object.prototype.hasOwnProperty.call(args, 'matchString')
    const hasCategoryName = Object.prototype.hasOwnProperty.call(args, 'categoryName')
    const hasPriority = Object.prototype.hasOwnProperty.call(args, 'priority')
    if (!hasMatchString && !hasCategoryName && !hasPriority) return 'Error: provide at least one field to update.'

    const { id, createdAt: _createdAt, ...rest } = current
    const next: CategoryRule = { ...rest }

    if (hasMatchString) {
      if (typeof args.matchString !== 'string' || !args.matchString.trim()) return 'Error: "matchString" cannot be blank.'
      next.match = 'contains'
      next.pattern = args.matchString.trim()
      next.caseSensitive = false
    }

    if (hasCategoryName) {
      if (typeof args.categoryName !== 'string' || !args.categoryName.trim()) return 'Error: "categoryName" cannot be blank.'
      const categoryName = args.categoryName.trim()
      const category = useCategoriesStore
        .getState()
        .items.find((item) => item.name.toLowerCase() === categoryName.toLowerCase())
      if (!category) return `Error: category "${args.categoryName}" was not found.`
      next.categoryId = category.id
    }

    if (hasPriority) {
      if (typeof args.priority !== 'number' || !Number.isInteger(args.priority) || args.priority < 0) {
        return 'Error: "priority" must be a non-negative integer.'
      }
      next.priority = args.priority
    }

    await rulesStore.updateItem(id, next)
    return `Updated normalization rule ${id}.`
  },
}
