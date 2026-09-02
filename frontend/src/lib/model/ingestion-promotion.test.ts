import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { entriesTable, entryLabelsTable, ingestionRowsTable, tableDefsTable } from './model-db'
import { promoteReadyIngestionRows, updateIngestionRowLabels, updateIngestionRowWorklist } from './ingestion-promotion'
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
      financeDestination: 'spending',
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
      financeDestination: 'movements',
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

    const validated = await updateIngestionRowLabels(rowId, { financeDestination: 'movements', flowRole: 'inflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'oneOff' }, tableId)

    expect(validated.validationErrors).toEqual([])
    expect(validated.status).toBe('ready')

    await promoteReadyIngestionRows([rowId])

    const promoted = (await entriesTable.toArray())[0].data as Record<string, unknown>
    expect(promoted).toMatchObject({ tableId, date, amount: 1200, direction: 'in' })
  })
})
