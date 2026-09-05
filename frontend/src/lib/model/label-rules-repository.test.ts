import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { addConfirmedRow } from './confirmed-rows'
import { applyLabelRulesToRows, labelRulesWithStats, saveLabelRule } from './label-rules-repository'
import { confirmedRowsTable } from './model-db'
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
