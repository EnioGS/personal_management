import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { categoriesTable, entriesTable, entryLabelsTable, ingestionRowsTable, tableDefsTable } from './model-db'
import { promoteReadyIngestionRows, reallocateConfirmedIngestionRows, revalidateIngestionRows, updateIngestionRowLabels, updateIngestionRowWorklist } from './ingestion-promotion'
import type { IngestionRow } from './types'

async function addCardRow() {
  const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'cardLedger' } })
  const rowId = await ingestionRowsTable.add({
    createdAt: 2,
    data: {
      sourceId: 1,
      sourceRowIndex: 0,
      sourceRowFingerprint: 'source-row',
      rawValues: { Date: '2026-01-02', Description: 'Coffee', Amount: '12.50' },
      mappedValues: { date: '2026-01-02', description: 'Coffee', amount: '12.50', rawCategory: 'Coffee' },
      labels: {},
      status: 'unlabelled',
      validationErrors: [],
    },
  })
  return { rowId, tableId }
}

describe('ingestion promotion', () => {
  beforeEach(async () => {
    await wipeAllData()
  })

  it('does not make a row ready until required labels and destination data are valid', async () => {
    const { rowId, tableId } = await addCardRow()
    const row = await updateIngestionRowLabels(rowId, {
      sections: ['finances'], subsections: ['spending'],
      flowRole: 'outflow',
      settlementChannel: 'creditCard',
      spendingTreatment: 'expense',
      recurrence: 'oneOff',
    }, tableId)

    expect(row.status).toBe('invalid')
    expect(row.validationErrors).toContain('Choose a semantic category for a spending row.')
  })

  it('keeps a worklist row unlabelled when a data field is added before any labels', async () => {
    const { rowId } = await addCardRow()
    const row = await updateIngestionRowWorklist(rowId, { mappedValues: { quantity: '' } })
    expect(row.mappedValues.quantity).toBe('')
    expect(row.status).toBe('unlabelled')
  })

  it('promotes a ready row once and persists its label sidecar', async () => {
    const { rowId, tableId } = await addCardRow()
    await updateIngestionRowLabels(rowId, {
      sections: ['finances'], subsections: ['overview'],
      flowRole: 'outflow',
      settlementChannel: 'creditCard',
      spendingTreatment: 'notApplicable',
      recurrence: 'oneOff',
    }, tableId)

    await expect(promoteReadyIngestionRows([rowId])).resolves.toEqual({ promoted: 1, reconciled: 0, errors: [] })
    expect(await entriesTable.count()).toBe(1)
    expect(await entryLabelsTable.count()).toBe(1)
    await expect(promoteReadyIngestionRows([rowId])).resolves.toEqual({ promoted: 0, reconciled: 0, errors: [`Row ${rowId} is not ready for promotion.`] })
    expect(await entriesTable.count()).toBe(1)
  })
})

describe('values that were never text', () => {
  beforeEach(async () => { await wipeAllData() })

  it('promotes a migrated row whose date is already epoch milliseconds', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Extrato Nubank', kind: 'bankLedger' } })
    const date = Date.UTC(2024, 8, 1)
    const rowId = await ingestionRowsTable.add({
      createdAt: 2,
      data: {
        sourceId: 1,
        sourceRowIndex: 0,
        sourceRowFingerprint: 'legacy-entry-7',
        rawValues: { description: 'Transferência recebida pelo Pix', amount: '1200' },
        mappedValues: { date, amount: 1200, description: 'Transferência recebida pelo Pix', direction: 'in', rawCategory: 'Pix' },
        labels: {},
        status: 'unlabelled',
        validationErrors: [],
      } satisfies IngestionRow,
    })

    const validated = await updateIngestionRowLabels(rowId, { sections: ['finances'], subsections: ['overview'], flowRole: 'inflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'oneOff' }, tableId)

    expect(validated.validationErrors).toEqual([])
    expect(validated.status).toBe('ready')

    await promoteReadyIngestionRows([rowId])

    const promoted = (await entriesTable.toArray())[0].data as Record<string, unknown>
    expect(promoted).toMatchObject({ tableId, date, amount: 1200, direction: 'in' })
  })
})

describe('relabelling a row that is already in a Finance table', () => {
  beforeEach(async () => { await wipeAllData() })

  async function confirmedRow() {
    const bankId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Extrato Nubank', kind: 'bankLedger' } })
    const cardId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Fatura Nubank', kind: 'cardLedger' } })
    const rowId = await ingestionRowsTable.add({
      createdAt: 2,
      data: { sourceId: 1, sourceRowIndex: 0, sourceRowFingerprint: 'r0', rawValues: { description: 'Assinatura' }, mappedValues: { date: '2026-01-02', amount: '19.90', description: 'Assinatura', direction: 'out', rawCategory: 'Assinatura' }, labels: {}, status: 'unlabelled', validationErrors: [] } satisfies IngestionRow,
    })
    await updateIngestionRowLabels(rowId, { sections: ['finances'], subsections: ['overview'], flowRole: 'outflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'oneOff' }, bankId)
    await promoteReadyIngestionRows([rowId])
    return { rowId, bankId, cardId, entryId: ((await ingestionRowsTable.get(rowId))!.data as IngestionRow).promotedEntryId! }
  }

  it('holds the edit until it is confirmed, leaving the live entry alone', async () => {
    const { rowId, cardId, entryId } = await confirmedRow()
    const categoryId = await categoriesTable.add({ createdAt: 1, data: { name: 'Assinaturas' } })

    const edited = await updateIngestionRowLabels(rowId, { sections: ['finances'], subsections: ['spending'], flowRole: 'outflow', settlementChannel: 'creditCard', spendingTreatment: 'expense', categoryId, recurrence: 'recurring' }, cardId)

    expect(edited.hasPendingChange).toBe(true)
    expect(edited.status).toBe('promoted')
    // The live entry still belongs to the bank table it was promoted into.
    expect(((await entriesTable.get(entryId))!.data as Record<string, unknown>).tableId).not.toBe(cardId)
  })

  it('rewrites the entry in place and its labels with it, keeping the same entry id', async () => {
    const { rowId, cardId, entryId } = await confirmedRow()
    const categoryId = await categoriesTable.add({ createdAt: 1, data: { name: 'Assinaturas' } })
    await updateIngestionRowLabels(rowId, { sections: ['finances'], subsections: ['spending'], flowRole: 'outflow', settlementChannel: 'creditCard', spendingTreatment: 'expense', categoryId, recurrence: 'recurring' }, cardId)

    const result = await reallocateConfirmedIngestionRows([rowId])

    expect(result).toEqual({ reallocated: 1, errors: [] })
    expect(await entriesTable.count()).toBe(1)
    expect((await entriesTable.get(entryId))!.data).toMatchObject({ tableId: cardId, amount: 19.9 })
    const labels = (await entryLabelsTable.toArray())[0].data as Record<string, unknown>
    expect(labels).toMatchObject({ entryId, sections: ['finances'], subsections: ['spending'], spendingTreatment: 'expense', recurrence: 'recurring' })
    expect(((await ingestionRowsTable.get(rowId))!.data as IngestionRow).hasPendingChange).toBe(false)
  })

  it('refuses to move a row whose new destination cannot hold it, and says why', async () => {
    const { rowId } = await confirmedRow()
    const investmentId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Renda Variável', kind: 'investmentLedger', investmentClass: 'variableIncome' } })

    const edited = await updateIngestionRowLabels(rowId, { sections: ['finances'], subsections: ['investments'], flowRole: 'outflow', settlementChannel: 'investment', spendingTreatment: 'notApplicable', recurrence: 'oneOff' }, investmentId)
    const result = await reallocateConfirmedIngestionRows([rowId])

    // An investment ledger asks for a class, an asset, a quantity and a price; a bank
    // row has none of them, and the first one missing is what the row is told about.
    expect(edited.validationErrors[0]).toMatch(/investmentClass|asset|quantity|price/)
    expect(result.reallocated).toBe(0)
    expect(result.errors[0]).toMatch(/investmentClass|asset|quantity|price/)
  })

  it('ignores a confirmed row nobody edited', async () => {
    const { rowId } = await confirmedRow()

    expect(await reallocateConfirmedIngestionRows([rowId])).toEqual({ reallocated: 0, errors: [] })
  })
})

describe('a verdict that outlived the code that reached it', () => {
  beforeEach(async () => { await wipeAllData() })

  it('is re-checked and cleared, without anyone editing the row', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Fatura', kind: 'cardLedger' } })
    const rowId = await ingestionRowsTable.add({
      createdAt: 2,
      data: {
        sourceId: 1, sourceRowIndex: 0, sourceRowFingerprint: 'r0', rawValues: {},
        // An amount written the way a Brazilian statement writes it.
        mappedValues: { date: '02/01/2026', amount: '87,40', description: 'Padaria', rawCategory: 'Alimentação' },
        labels: { sections: ['finances'], subsections: ['spending'], flowRole: 'outflow', settlementChannel: 'creditCard', spendingTreatment: 'expense', recurrence: 'oneOff', categoryId: 1 },
        destinationTableId: tableId,
        // The verdict an older parser reached, stored on the row.
        status: 'invalid', validationErrors: ['"amount" is not a number'],
      } satisfies IngestionRow,
    })
    await categoriesTable.add({ createdAt: 1, data: { name: 'Alimentação' } })

    const result = await revalidateIngestionRows()

    expect(result).toMatchObject({ checked: 1, changed: 1, nowReady: 1 })
    const stored = (await ingestionRowsTable.get(rowId))!.data as IngestionRow
    expect(stored.status).toBe('ready')
    expect(stored.validationErrors).toEqual([])

    await promoteReadyIngestionRows([rowId])
    expect((await entriesTable.toArray())[0].data).toMatchObject({ amount: 87.4 })
  })
})
