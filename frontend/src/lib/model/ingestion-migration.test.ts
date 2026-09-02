import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { entriesTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from './model-db'
import { migrateExistingEntriesToIngestion } from './ingestion-migration'

describe('existing-entry ingestion migration', () => {
  beforeEach(async () => { await wipeAllData() })

  it('moves an unlabelled entry out of its finance table and into the worklist', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'bankLedger' } })
    await entriesTable.add({ createdAt: 2, data: { tableId, date: 1, direction: 'out', category: 'Pix', description: 'Payment', amount: 10 } })

    await expect(migrateExistingEntriesToIngestion()).resolves.toEqual({ queued: 1, skipped: 0 })

    expect(await entriesTable.count()).toBe(0)
    expect((await ingestionRowsTable.toArray())[0].data).toMatchObject({
      destinationTableId: tableId,
      labels: {},
      status: 'unlabelled',
      rawValues: { description: 'Payment', amount: '10' },
    })
  })

  it('leaves an entry whose labels are already confirmed exactly where it is', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'bankLedger' } })
    const entryId = await entriesTable.add({ createdAt: 2, data: { tableId, date: 1, direction: 'in', amount: 10 } })
    const { entryLabelsTable } = await import('./model-db')
    await entryLabelsTable.add({ createdAt: 3, data: { entryId, financeDestination: 'movements', flowRole: 'inflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'oneOff' } })

    await expect(migrateExistingEntriesToIngestion()).resolves.toEqual({ queued: 0, skipped: 1 })

    expect(await entriesTable.count()).toBe(1)
    expect(await ingestionRowsTable.count()).toBe(0)
  })

  it('demotes every unfinalized legacy row an older version auto-labelled, and removes the entry it left behind', async () => {
    const { rowId, entryId } = await queueLegacyRowTheOldWay()

    await migrateExistingEntriesToIngestion()

    expect((await ingestionRowsTable.get(rowId))?.data).toMatchObject({ labels: {}, labelValues: {}, status: 'unlabelled' })
    expect(await entriesTable.get(entryId)).toBeUndefined()
  })

  it('repairs the legacy queue only once, so labels assigned afterwards survive a reload', async () => {
    const { rowId } = await queueLegacyRowTheOldWay()
    await migrateExistingEntriesToIngestion()
    const reviewed = { ...((await ingestionRowsTable.get(rowId))!.data as object), labels: { financeDestination: 'movements', flowRole: 'inflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'undecided' }, status: 'ready', validationErrors: [] }
    await ingestionRowsTable.update(rowId, { data: reviewed })

    await migrateExistingEntriesToIngestion()

    expect((await ingestionRowsTable.get(rowId))?.data).toMatchObject({ status: 'ready', labels: { flowRole: 'inflow' } })
  })
})

/**
 * Reproduces a database written before this migration stopped guessing labels and
 * started moving the entry: a ready row linked to an entry still in its table.
 */
async function queueLegacyRowTheOldWay() {
  const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'bankLedger' } })
  await entriesTable.add({ createdAt: 2, data: { tableId, date: 1, direction: 'in', category: 'Pix', description: 'Transfer', amount: 10 } })
  await migrateExistingEntriesToIngestion()
  const stored = (await ingestionRowsTable.toArray())[0]
  const entryId = await entriesTable.add({ createdAt: 4, data: { tableId, date: 1, direction: 'in', category: 'Pix', description: 'Transfer', amount: 10 } })
  await ingestionRowsTable.update(stored.id, { data: { ...(stored.data as object), existingEntryId: entryId, labels: { financeDestination: 'movements', flowRole: 'inflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'undecided' }, status: 'ready', validationErrors: [] } })
  const source = (await ingestionSourcesTable.toArray())[0]
  const { repairVersion: _stale, ...beforeTheRepair } = source.data as { repairVersion?: number }
  await ingestionSourcesTable.update(source.id, { data: beforeTheRepair })
  return { rowId: stored.id, entryId }
}
