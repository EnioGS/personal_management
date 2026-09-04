import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { ingestionRowsTable, labelRulesTable, tableDefsTable } from '@/lib/model/model-db'
import type { IngestionRow, LabelRule } from '@/lib/model/types'
import { applyLabelRulesTool, deleteLabelRuleTool, listLabelRulesTool, saveLabelRuleTool } from './label-rule-tools'

const context = { attachments: [], translate: (key: string) => key } as never

describe('standing rules through the assistant', () => {
  beforeEach(async () => { await wipeAllData() })

  it('saves and applies one without asking, and says what it filled', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Fatura', kind: 'cardLedger' } })
    await ingestionRowsTable.add({
      createdAt: 2,
      data: { sourceId: 1, sourceRowIndex: 0, sourceRowFingerprint: 'r0', rawValues: {}, mappedValues: { date: '2026-01-02', amount: '44.90', description: 'Netflix', rawCategory: 'Assinatura' }, labels: {}, status: 'unlabelled', validationErrors: [] } satisfies IngestionRow,
    })

    const result = JSON.parse(await saveLabelRuleTool.execute({
      name: 'Netflix', contains: 'netflix', rationale: 'A monthly subscription billed to the card; the name never means anything else.',
      sections: 'finances', subsections: 'spending', flowRole: 'outflow', settlementChannel: 'creditCard',
      spendingTreatment: 'expense', recurrence: 'recurring', category: 'Assinaturas', destinationTableId: tableId,
    }, context))

    expect(result.ruleId).toBeDefined()
    expect(result.applied).toMatchObject({ rowsTouched: 1, becameReady: 1 })
    expect((await labelRulesTable.toArray())[0].data).toMatchObject({ createdBy: 'assistant', rationale: expect.any(String) })
  })

  it('refuses a rule with no rationale, since nobody could judge it later', async () => {
    expect(await saveLabelRuleTool.execute({ contains: 'netflix', flowRole: 'outflow' }, context)).toContain('rationale is required')
  })

  it('reports what each rule may claim', async () => {
    await labelRulesTable.add({ createdAt: 1, data: { field: 'description', contains: 'netflix', labels: { recurrence: 'recurring' }, rationale: 'Monthly.', createdBy: 'assistant', createdAt: 1 } satisfies LabelRule })

    const listed = JSON.parse(await listLabelRulesTool.execute({}, context))

    expect(listed[0]).toMatchObject({ name: 'netflix', rationale: 'Monthly.', stats: { applied: 0, confirmedRespected: 0 } })
  })

  it('still asks before deleting one', async () => {
    const ruleId = await labelRulesTable.add({ createdAt: 1, data: { field: 'description', contains: 'netflix', labels: {}, rationale: 'x', createdBy: 'user', createdAt: 1 } satisfies LabelRule })

    expect(await deleteLabelRuleTool.execute({ ruleId }, context)).toContain('confirmation is required')
    expect(await labelRulesTable.count()).toBe(1)

    await deleteLabelRuleTool.execute({ ruleId, confirmed: true }, context)
    expect(await labelRulesTable.count()).toBe(0)
  })

  it('runs the standing rules over waiting rows on its own', async () => {
    expect(JSON.parse(await applyLabelRulesTool.execute({}, context))).toMatchObject({ rowsTouched: 0 })
  })
})
