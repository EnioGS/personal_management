import { useCategoriesStore, useCategoryRulesStore } from '@/lib/model/model-stores'
import type { ToolDefinition } from './types'

export const addCategoryTool: ToolDefinition = {
  name: 'add_category',
  description:
    'Adds a normalization rule for a canonical category. Requires categoryName (the label shown in reports) and ' +
    'matchString (text searched inside raw category values). If categoryName already exists, it is reused so one ' +
    'category can have multiple match strings; otherwise a new category is created. The match string is always a ' +
    'case-insensitive substring match, and the new rule is placed at the bottom of the normalization order, after ' +
    'existing rules. Because categories resolve at read time, this immediately classifies matching existing values ' +
    'without changing row data.',
  parameters: {
    type: 'object',
    properties: {
      categoryName: { type: 'string', description: 'The canonical category name; an existing name adds another match string to it.' },
      matchString: { type: 'string', description: 'The case-insensitive substring to match in raw values.' },
    },
    required: ['categoryName', 'matchString'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const categoryName = typeof args.categoryName === 'string' ? args.categoryName.trim() : ''
    const matchString = typeof args.matchString === 'string' ? args.matchString.trim() : ''
    if (!categoryName || !matchString) return 'Error: "categoryName" and "matchString" are required and cannot be blank.'

    const categories = useCategoriesStore.getState().items
    const existingCategory = categories.find((category) => category.name.toLowerCase() === categoryName.toLowerCase())
    const categoryId = existingCategory?.id ?? await useCategoriesStore.getState().addItem({ name: categoryName })
    const rules = useCategoryRulesStore.getState().items
    const priority = rules.length > 0 ? Math.max(...rules.map((rule) => rule.priority)) + 1 : 0
    await useCategoryRulesStore.getState().addItem({
      categoryId,
      match: 'contains',
      pattern: matchString,
      caseSensitive: false,
      priority,
    })

    return existingCategory
      ? `Added match string "${matchString}" to existing category "${existingCategory.name}" at priority ${priority}.`
      : `Added category "${categoryName}" with match string "${matchString}" at priority ${priority}.`
  },
}
