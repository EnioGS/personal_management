import { entriesTable, entryLabelsTable, ingestionAuditEventsTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from './model-db'
import type { Entry, IngestionRow, IngestionSource, TableDef } from './types'

const LEGACY_FINGERPRINT = 'existing-app-data-v1'

/** Queues active historical entries once, linked by existingEntryId so reconciliation cannot insert duplicates. */
export async function migrateExistingEntriesToIngestion(): Promise<{ queued: number; skipped: number }> {
  let source = (await ingestionSourcesTable.toArray()).find((row) => (row.data as IngestionSource).sourceFingerprint === LEGACY_FINGERPRINT)
  if (!source) {
    const sourceId = await ingestionSourcesTable.add({ createdAt: Date.now(), data: { originalFilename: 'Existing data migration', sourceFingerprint: LEGACY_FINGERPRINT, importedAt: Date.now(), rawCsv: '', originalColumns: [], supplementalColumns: [], rowCount: 0, status: 'staged', legacy: true } satisfies IngestionSource })
    source = (await ingestionSourcesTable.get(sourceId))!
  }
  const sourceId = source.id
  const tableDefs = new Map((await tableDefsTable.toArray()).map((row) => [row.id, row.data as TableDef]))
  const existingRows = await ingestionRowsTable.toArray()
  const existingIds = new Set(existingRows.map((row) => (row.data as IngestionRow).existingEntryId).filter((id): id is number => typeof id === 'number'))
  const labelledEntryIds = new Set((await entryLabelsTable.toArray()).map((row) => (row.data as { entryId?: number }).entryId).filter((id): id is number => typeof id === 'number'))
  const pending: IngestionRow[] = []
  let skipped = 0
  for (const stored of await entriesTable.toArray()) {
    const entry = stored.data as Entry
    if (entry.deleted || existingIds.has(stored.id) || labelledEntryIds.has(stored.id)) { skipped += 1; continue }
    const table = tableDefs.get(entry.tableId)
    if (!table) { skipped += 1; continue }
    const rawValues = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'tableId').map(([key, value]) => [key, String(value ?? '')]))
    // Historical data is merely staged.  It must never acquire inferred labels
    // or become ready without an explicit review in the ingestion centre.
    const row: IngestionRow = { sourceId, sourceRowIndex: stored.id, sourceRowFingerprint: `legacy-entry-${stored.id}`, rawValues, mappedValues: { ...entry } as IngestionRow['mappedValues'], labels: {}, destinationTableId: entry.tableId, status: 'unlabelled', validationErrors: ['Assign the required labels before confirmation.'], existingEntryId: stored.id }
    pending.push(row)
  }
  // Correct rows created by the earlier migration that accidentally became
  // ready from suggested values.  Finalized rows are left intact.
  const queuedRows = existingRows.filter((stored) => {
    const row = stored.data as IngestionRow
    return row.existingEntryId && row.status !== 'promoted' && row.status !== 'reconciledExisting' && row.status !== 'unlabelled'
  })
  for (const stored of queuedRows) {
    const row = stored.data as IngestionRow
    await ingestionRowsTable.update(stored.id, { data: { ...row, labels: {}, labelValues: {}, status: 'unlabelled', validationErrors: ['Assign the required labels before confirmation.'] } })
  }
  if (pending.length) await ingestionRowsTable.bulkAdd(pending.map((row) => ({ createdAt: Date.now(), data: row })))
  await ingestionAuditEventsTable.add({ createdAt: Date.now(), data: { event: 'rowsStaged', actor: 'migration', sourceId, ingestionRowIds: [], details: { queued: pending.length, skipped } } })
  return { queued: pending.length, skipped }
}
