import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { labelRulesTable, sourceRowsTable } from '@/lib/model/model-db'
import type { LabelRule, SourceRow } from '@/lib/model/types'
import { applyLabelRulesTool, deleteLabelRuleTool, editLabelRuleTool, listLabelRulesTool, saveLabelRuleTool } from './label-rule-tools'

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

describe('rewriting a rule', () => {
  beforeEach(async () => { await wipeAllData() })

  async function savedRule() {
    await saveLabelRuleTool.execute({
      context: 'source', name: 'Netflix', contains: 'netflix', category: 'assinaturas',
      rationale: 'A monthly subscription; the name never means anything else.',
    }, context)
    return (await labelRulesTable.toArray())[0]
  }

  it('changes what it was given and keeps everything else, including who wrote it', async () => {
    const rule = await savedRule()

    const result = JSON.parse(await editLabelRuleTool.execute({ ruleId: rule.id, contains: 'netflix.com', match: 'startsWith' }, context))

    expect(result.rule).toMatchObject({
      contains: 'netflix.com',
      match: 'startsWith',
      name: 'Netflix',
      labels: { category: 'assinaturas' },
      createdBy: 'assistant',
      editedBy: 'assistant',
    })
  })

  it('keeps the labels it was not asked about', async () => {
    const rule = await savedRule()

    await editLabelRuleTool.execute({ ruleId: rule.id, subcategory: 'streaming' }, context)

    expect((await labelRulesTable.get(rule.id))!.data).toMatchObject({
      labels: { category: 'assinaturas', subcategory: 'streaming' },
    })
  })

  it('refuses a pattern that cannot compile, leaving the rule as it was', async () => {
    const rule = await savedRule()

    expect(await editLabelRuleTool.execute({ ruleId: rule.id, contains: 'net(flix', match: 'regex' }, context)).toContain('not a usable regular expression')
    expect((await labelRulesTable.get(rule.id))!.data).toMatchObject({ contains: 'netflix' })
  })

  it('says so when there is no such rule', async () => {
    expect(await editLabelRuleTool.execute({ ruleId: 999, contains: 'x' }, context)).toContain('no rule has id 999')
  })
})
