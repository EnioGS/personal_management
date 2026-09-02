import { beforeEach, describe, expect, it } from 'vitest'
import { useCategoriesStore, useCategoryRulesStore } from '@/lib/model/model-stores'
import { clearLocalStores } from '@/lib/local-store/test-utils'
import { addCategoryTool } from './add-category'
import { deleteCategoryRuleTool } from './delete-category-rule'
import { readCategoryRawValuesTool } from './read-category-raw-values'
import { updateCategoryRuleTool } from './update-category-rule'
import { addItemFor } from './writable-tables'
import { clearTables, seedTable } from './test-utils'

const context = { attachments: [] }

beforeEach(async () => {
  await clearTables()
  await clearLocalStores(useCategoriesStore, useCategoryRulesStore)
})

describe('category assistant tools', () => {
  it('provides model-facing context for every category function', () => {
    expect(readCategoryRawValuesTool.description).toContain('ruleId')
    expect(addCategoryTool.description).toContain('case-insensitive substring')
    expect(updateCategoryRuleTool.description).toContain('first matching rule wins')
    expect(deleteCategoryRuleTool.description).toContain('Ask the user for confirmation before doing this operation since it is destructive.')
  })

  it('adds a category and a case-insensitive substring rule', async () => {
    const result = await addCategoryTool.execute({ categoryName: 'Recebida pelo Pix', matchString: 'pix' }, context)
    expect(result).toContain('Added category')
    expect(useCategoriesStore.getState().items[0].name).toBe('Recebida pelo Pix')
    expect(useCategoryRulesStore.getState().items[0]).toMatchObject({
      match: 'contains',
      pattern: 'pix',
      caseSensitive: false,
      priority: 0,
    })
  })

  it('adds additional match strings to an existing category instead of duplicating it', async () => {
    await addCategoryTool.execute({ categoryName: 'Food', matchString: 'mercado' }, context)
    const result = await addCategoryTool.execute({ categoryName: 'food', matchString: 'restaurante' }, context)

    expect(result).toContain('existing category "Food"')
    expect(useCategoriesStore.getState().items).toHaveLength(1)
    expect([...useCategoryRulesStore.getState().items].sort((a, b) => a.priority - b.priority)).toMatchObject([
      { categoryId: useCategoriesStore.getState().items[0].id, pattern: 'mercado', priority: 0 },
      { categoryId: useCategoriesStore.getState().items[0].id, pattern: 'restaurante', priority: 1 },
    ])
  })

  it('reports raw values and whether a rule assigns them', async () => {
    await addCategoryTool.execute({ categoryName: 'Recebida pelo Pix', matchString: 'pix' }, context)
    const tableId = Number(await seedTable('generic'))
    await addItemFor(tableId, { date: Date.now(), category: 'Transferência recebida pelo Pix', amount: 10 })
    await addItemFor(tableId, { date: Date.now(), category: 'Supermercado', amount: 20 })

    const values = JSON.parse(await readCategoryRawValuesTool.execute({}, context)) as {
      rawValues: { value: string; unmatched: boolean; matchingStrings: string[]; matchedCategories: string[] }[]
      normalizationRules: { ruleId: number; matchString: string; categoryName: string | null; priority: number }[]
    }
    expect(values.rawValues).toEqual([
      {
        value: 'Supermercado',
        count: 1,
        matchingStrings: [],
        matchedCategories: [],
        unmatched: true,
      },
      {
        value: 'Transferência recebida pelo Pix',
        count: 1,
        matchingStrings: ['pix'],
        matchedCategories: ['Recebida pelo Pix'],
        unmatched: false,
      },
    ])
    expect(values.normalizationRules).toEqual([
      expect.objectContaining({
        ruleId: useCategoryRulesStore.getState().items[0].id,
        matchString: 'pix',
        categoryName: 'Recebida pelo Pix',
        priority: 0,
      }),
    ])
  })

  it('updates a rule and requires confirmation before deleting it', async () => {
    await addCategoryTool.execute({ categoryName: 'Food', matchString: 'mercado' }, context)
    const ruleId = useCategoryRulesStore.getState().items[0].id

    await updateCategoryRuleTool.execute({ ruleId, matchString: 'supermercado' }, context)
    expect(useCategoryRulesStore.getState().items[0]).toMatchObject({ pattern: 'supermercado', match: 'contains', caseSensitive: false })

    expect(await deleteCategoryRuleTool.execute({ ruleId, confirmed: false }, context)).toContain('confirmation is required')
    expect(useCategoryRulesStore.getState().items).toHaveLength(1)
    await deleteCategoryRuleTool.execute({ ruleId, confirmed: true }, context)
    expect(useCategoryRulesStore.getState().items).toHaveLength(0)
  })
})
