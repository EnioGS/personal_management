import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { addConfirmedRow } from './confirmed-rows'
import { applyLabelRulesToRows, labelRulesWithStats, saveLabelRule } from './label-rules-repository'
import { confirmedRowsTable, sourceRowsTable } from './model-db'
import type { ConfirmedRow } from './types'

const translate = (key: string) => key

async function only(): Promise<ConfirmedRow> {
  return (await confirmedRowsTable.toArray())[0].data as ConfirmedRow
}

describe('a confirmed rule', () => {
  beforeEach(async () => { await wipeAllData() })

  it('fills the account and the card, not only what a row means', async () => {
    const id = await addConfirmedRow('finances', 'movements')
    await confirmedRowsTable.update(id, { data: { ...(await only()), observations: JSON.stringify({ d: 'Pagamento de fatura' }) } })
    await saveLabelRule({
      context: 'confirmed',
      field: 'observations',
      contains: 'fatura',
      labels: { account: 'Nubank - Main account', card: 'Nubank - Main credit card', category: 'cartão' },
      rationale: 'Paying the card bill.',
      createdBy: 'user',
      createdAt: 1,
    })

    expect(await applyLabelRulesToRows('confirmed', translate)).toMatchObject({ rowsTouched: 1 })
    expect(await only()).toMatchObject({
      account: 'Nubank - Main account',
      card: 'Nubank - Main credit card',
      category: 'cartão',
    })
  })

  it('reads as respected once the row holds what it said', async () => {
    const id = await addConfirmedRow('finances', 'movements')
    await confirmedRowsTable.update(id, { data: { ...(await only()), observations: JSON.stringify({ d: 'Pagamento de fatura' }) } })
    await saveLabelRule({
      context: 'confirmed',
      field: 'observations',
      contains: 'fatura',
      labels: { card: 'Nubank - Main credit card' },
      rationale: 'Paying the card bill.',
      createdBy: 'user',
      createdAt: 1,
    })
    await applyLabelRulesToRows('confirmed', translate)

    const [{ stats }] = await labelRulesWithStats('confirmed')

    expect(stats).toMatchObject({ applied: 1, confirmedRespected: 1, overridden: 0 })
  })
})

describe('applying one rule rather than all of them', () => {
  beforeEach(async () => { await wipeAllData() })

  const sourceRule = (over: { contains: string; labels: Record<string, string> }) => ({
    context: 'source' as const,
    field: 'description',
    contains: over.contains,
    labels: over.labels,
    rationale: 'test',
    createdBy: 'user' as const,
    createdAt: 1,
  })

  it('runs only the rule it was given, leaving the standing ones alone', async () => {
    await saveLabelRule(sourceRule({ contains: 'netflix', labels: { category: 'streaming' } }))
    const second = await saveLabelRule(sourceRule({ contains: 'mercado', labels: { category: 'compras' } }))
    await sourceRowsTable.add({ createdAt: 1, data: { sourceId: 1, rowId: 'a', values: { description: 'NETFLIX.COM' }, labels: {} } })
    await sourceRowsTable.add({ createdAt: 1, data: { sourceId: 1, rowId: 'b', values: { description: 'MERCADO SAO JORGE' }, labels: {} } })

    const result = await applyLabelRulesToRows('source', (key) => key, undefined, [second])

    // The Netflix row is untouched: saving one rule is not a reason to re-run the others
    // over every row, which is hundreds of writes to fill none.
    expect(result.rowsTouched).toBe(1)
    const labels = (await sourceRowsTable.toArray()).map((row) => (row.data as { labels: { category?: string } }).labels.category)
    expect(labels).toEqual([undefined, 'compras'])
  })

  it('runs everything when it is not told otherwise', async () => {
    await saveLabelRule(sourceRule({ contains: 'netflix', labels: { category: 'streaming' } }))
    await saveLabelRule(sourceRule({ contains: 'mercado', labels: { category: 'compras' } }))
    await sourceRowsTable.add({ createdAt: 1, data: { sourceId: 1, rowId: 'a', values: { description: 'NETFLIX.COM' }, labels: {} } })
    await sourceRowsTable.add({ createdAt: 1, data: { sourceId: 1, rowId: 'b', values: { description: 'MERCADO SAO JORGE' }, labels: {} } })

    expect((await applyLabelRulesToRows('source', (key) => key)).rowsTouched).toBe(2)
  })
})
