import { entriesTable, entryLabelsTable, ingestionAuditEventsTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from './model-db'
import type { Entry, IngestionRow, IngestionSource, TableDef } from './types'

const LEGACY_FINGERPRINT = 'existing-app-data-v1'
/** Bumping this replays the one-off repair of already-queued legacy rows. */
const LEGACY_REPAIR_VERSION = 1
const UNLABELLED_REASON = 'Assign the required labels before confirmation.'

/** Queues active historical entries once, linked by existingEntryId so reconciliation cannot insert duplicates. */
export async function migrateExistingEntriesToIngestion(): Promise<{ queued: number; skipped: number }> {
  let source = (await ingestionSourcesTable.toArray()).find((row) => (row.data as IngestionSource).sourceFingerprint === LEGACY_FINGERPRINT)
  if (!source) {
    const sourceId = await ingestionSourcesTable.add({ createdAt: Date.now(), data: { originalFilename: 'Existing data migration', sourceFingerprint: LEGACY_FINGERPRINT, importedAt: Date.now(), rawCsv: '', originalColumns: [], supplementalColumns: [], rowCount: 0, status: 'staged', legacy: true, repairVersion: LEGACY_REPAIR_VERSION } satisfies IngestionSource })
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
    const row: IngestionRow = { sourceId, sourceRowIndex: stored.id, sourceRowFingerprint: `legacy-entry-${stored.id}`, rawValues, mappedValues: { ...entry } as IngestionRow['mappedValues'], labels: {}, destinationTableId: entry.tableId, status: 'unlabelled', validationErrors: [UNLABELLED_REASON], existingEntryId: stored.id }
    pending.push(row)
  }
  // Earlier versions of this migration guessed labels, which left historical rows
  // ready for promotion without any review. Clear them once — guarded by the
  // source's repair version so a later run never discards the labels the user
  // has assigned since. Finalized rows are left intact.
  if ((source.data as IngestionSource).repairVersion !== LEGACY_REPAIR_VERSION) {
    const queuedRows = existingRows.filter((stored) => {
      const row = stored.data as IngestionRow
      return row.sourceId === sourceId && row.status !== 'promoted' && row.status !== 'reconciledExisting'
    })
    for (const stored of queuedRows) {
      const row = stored.data as IngestionRow
      await ingestionRowsTable.update(stored.id, { data: { ...row, labels: {}, labelValues: {}, status: 'unlabelled', validationErrors: [UNLABELLED_REASON] } })
    }
    await ingestionSourcesTable.update(sourceId, { data: { ...(source.data as IngestionSource), repairVersion: LEGACY_REPAIR_VERSION } })
  }
  if (pending.length) await ingestionRowsTable.bulkAdd(pending.map((row) => ({ createdAt: Date.now(), data: row })))
  await ingestionAuditEventsTable.add({ createdAt: Date.now(), data: { event: 'rowsStaged', actor: 'migration', sourceId, ingestionRowIds: [], details: { queued: pending.length, skipped } } })
  return { queued: pending.length, skipped }
}
