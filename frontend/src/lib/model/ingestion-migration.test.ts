import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { entriesTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from './model-db'
import { migrateExistingEntriesToIngestion } from './ingestion-migration'

describe('existing-entry ingestion migration', () => {
  beforeEach(async () => { await wipeAllData() })

  it('queues active entries once as linked rows without writing a duplicate entry', async () => {
    const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'bankLedger' } })
    const entryId = await entriesTable.add({ createdAt: 2, data: { tableId, date: 1, direction: 'out', category: 'Pix', description: 'Payment', amount: 10 } })

    await expect(migrateExistingEntriesToIngestion()).resolves.toEqual({ queued: 1, skipped: 0 })
    await expect(migrateExistingEntriesToIngestion()).resolves.toEqual({ queued: 0, skipped: 1 })
    expect(await entriesTable.count()).toBe(1)
    expect((await ingestionRowsTable.toArray())[0].data).toMatchObject({ existingEntryId: entryId, destinationTableId: tableId, labels: {}, status: 'unlabelled' })
  })

  it('demotes every unfinalized legacy-source row that older versions auto-labelled', async () => {
    const stored = await queueLegacyRowLabelledByAnOlderVersion()

    await migrateExistingEntriesToIngestion()

    expect((await ingestionRowsTable.get(stored.id))?.data).toMatchObject({ labels: {}, labelValues: {}, status: 'unlabelled' })
  })

  it('repairs the legacy queue only once, so labels assigned afterwards survive a reload', async () => {
    const stored = await queueLegacyRowLabelledByAnOlderVersion()
    await migrateExistingEntriesToIngestion()
    const reviewed = { ...((await ingestionRowsTable.get(stored.id))!.data as object), labels: { financeDestinations: ['movements'], flowRole: 'inflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'unknown' }, status: 'ready', validationErrors: [] }
    await ingestionRowsTable.update(stored.id, { data: reviewed })

    await migrateExistingEntriesToIngestion()

    expect((await ingestionRowsTable.get(stored.id))?.data).toMatchObject({ status: 'ready', labels: { flowRole: 'inflow' } })
  })
})

/** Reproduces a database written before the migration stopped guessing labels. */
async function queueLegacyRowLabelledByAnOlderVersion() {
  const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'bankLedger' } })
  await entriesTable.add({ createdAt: 2, data: { tableId, date: 1, direction: 'in', category: 'Pix', description: 'Transfer', amount: 10 } })
  await migrateExistingEntriesToIngestion()
  const stored = (await ingestionRowsTable.toArray())[0]
  await ingestionRowsTable.update(stored.id, { data: { ...(stored.data as object), labels: { financeDestinations: ['movements'], flowRole: 'inflow', settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'unknown' }, status: 'ready', validationErrors: [] } })
  const source = (await ingestionSourcesTable.toArray())[0]
  const { repairVersion: _removed, ...withoutRepairMarker } = source.data as { repairVersion?: number }
  await ingestionSourcesTable.update(source.id, { data: withoutRepairMarker })
  return stored
}
