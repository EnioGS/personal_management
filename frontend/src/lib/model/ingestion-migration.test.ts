import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { entriesTable, ingestionRowsTable, tableDefsTable } from './model-db'
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
})
