import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { entriesTable, entryLabelsTable, ingestionRowsTable, tableDefsTable } from './model-db'
import { promoteReadyIngestionRows, updateIngestionRowLabels } from './ingestion-promotion'

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
      financeDestinations: ['spending'],
      flowRole: 'outflow',
      settlementChannel: 'creditCard',
      spendingTreatment: 'expense',
      recurrence: 'oneOff',
    }, tableId)

    expect(row.status).toBe('invalid')
    expect(row.validationErrors).toContain('Choose a semantic category for a spending row.')
  })

  it('promotes a ready row once and persists its label sidecar', async () => {
    const { rowId, tableId } = await addCardRow()
    await updateIngestionRowLabels(rowId, {
      financeDestinations: ['movements'],
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
