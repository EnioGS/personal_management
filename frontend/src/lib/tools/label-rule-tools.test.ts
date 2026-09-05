import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { labelRulesTable, sourceRowsTable } from '@/lib/model/model-db'
import type { LabelRule, SourceRow } from '@/lib/model/types'
import { applyLabelRulesTool, deleteLabelRuleTool, listLabelRulesTool, saveLabelRuleTool } from './label-rule-tools'

const context = { attachments: [], translate: (key: string) => key } as never

async function sourceRow(values: Record<string, string>) {
  return sourceRowsTable.add({
    createdAt: 2,
    data: { sourceId: 1, rowId: 'r0', values, labels: { category: 'outros', subcategory: 'outros' } } satisfies SourceRow,
  })
}

describe('standing rules through the assistant', () => {
  beforeEach(async () => { await wipeAllData() })

  it('saves and applies one without asking, and says what it filled', async () => {
    await sourceRow({ source_filename: 'fatura.csv', description: 'Netflix.com', amount: '44.90' })

    const result = JSON.parse(await saveLabelRuleTool.execute({
      name: 'Netflix',
      context: 'source',
      contains: 'netflix',
      rationale: 'A monthly subscription billed to the card; the name never means anything else.',
      category: 'assinaturas',
      subcategory: 'streaming',
    }, context))

    expect(result.ruleId).toBeDefined()
    expect(result.applied).toMatchObject({ rowsTouched: 1 })
    expect((await labelRulesTable.toArray())[0].data).toMatchObject({ createdBy: 'assistant', context: 'source', rationale: expect.any(String) })
    expect((await sourceRowsTable.toArray())[0].data).toMatchObject({ labels: { category: 'assinaturas', subcategory: 'streaming' } })
  })

  it('refuses a rule with no rationale, since nobody could judge it later', async () => {
    expect(await saveLabelRuleTool.execute({ contains: 'netflix', context: 'source', category: 'x' }, context)).toContain('rationale is required')
  })

  it('refuses a regular expression that cannot compile, at the moment it is written', async () => {
    const refusal = await saveLabelRuleTool.execute({
      context: 'source', contains: 'net(flix', match: 'regex', category: 'assinaturas', rationale: 'Streaming.',
    }, context)

    expect(refusal).toContain('not a usable regular expression')
    expect(await labelRulesTable.count()).toBe(0)
  })

  it('never crosses the two stages: a confirmed rule is invisible to the source listing', async () => {
    await labelRulesTable.add({ createdAt: 1, data: { context: 'confirmed', field: 'observations', contains: 'uber', labels: { category: 'transporte' }, rationale: 'Rides.', createdBy: 'user', createdAt: 1 } satisfies LabelRule })

    expect(JSON.parse(await listLabelRulesTool.execute({ context: 'source' }, context))).toEqual([])
    expect(JSON.parse(await listLabelRulesTool.execute({ context: 'confirmed' }, context))[0]).toMatchObject({ name: 'uber', context: 'confirmed' })
  })

  it('still asks before deleting one', async () => {
    const ruleId = await labelRulesTable.add({ createdAt: 1, data: { context: 'source', field: 'description', contains: 'netflix', labels: { category: 'x' }, rationale: 'x', createdBy: 'user', createdAt: 1 } satisfies LabelRule })

    expect(await deleteLabelRuleTool.execute({ ruleId }, context)).toContain('confirmation is required')
    expect(await labelRulesTable.count()).toBe(1)

    await deleteLabelRuleTool.execute({ ruleId, confirmed: true }, context)
    expect(await labelRulesTable.count()).toBe(0)
  })

  it('runs the standing rules over waiting rows on its own', async () => {
    expect(JSON.parse(await applyLabelRulesTool.execute({ context: 'source' }, context))).toMatchObject({ rowsTouched: 0 })
  })
})
