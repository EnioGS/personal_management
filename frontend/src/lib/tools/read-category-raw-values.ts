import { collectCategoryRawValues } from '@/lib/model/use-unclassified-values'
import { useCategoriesStore, useCategoryRulesStore, useEntriesStore, useTableDefsStore } from '@/lib/model/model-stores'
import type { ToolDefinition } from './types'

export const readCategoryRawValuesTool: ToolDefinition = {
  name: 'read_category_raw_values',
  description:
    'Reads every raw category value found in the user\'s table data, ranked by frequency. ' +
    'For each value, reports its occurrence count, the matching string and category that currently owns it, ' +
    'or unmatched when no normalization rule applies. The result also includes every normalization rule with its ' +
    'ruleId, match type, matchString, destination category, priority, and scope, including rules that match no values. ' +
    'Use those rule IDs when editing or deleting a rule. This is read-only and never changes rows or rules.',
  parameters: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  execute: async () => {
    const categories = useCategoriesStore.getState().items
    const rules = useCategoryRulesStore.getState().items
    const rawValues = collectCategoryRawValues({
      tableDefs: useTableDefsStore.getState().items,
      entries: useEntriesStore.getState().items,
      categories,
      rules,
    })
    const normalizationRules = rules
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .map((rule) => ({
        ruleId: rule.id,
        match: rule.match,
        matchString: rule.pattern,
        categoryId: rule.categoryId,
        categoryName: categories.find((category) => category.id === rule.categoryId)?.name ?? null,
        caseSensitive: rule.caseSensitive ?? false,
        priority: rule.priority,
        scope: rule.scope ?? null,
      }))

    return JSON.stringify({ rawValues, normalizationRules }, null, 2)
  },
}
