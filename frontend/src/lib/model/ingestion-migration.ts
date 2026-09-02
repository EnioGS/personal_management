import { entriesTable, entryLabelsTable, ingestionAuditEventsTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from './model-db'
import type { Entry, IngestionRow, IngestionSource, TableDef } from './types'

const LEGACY_FINGERPRINT = 'existing-app-data-v1'
/** Bumping this replays the one-off repair of already-queued legacy rows. */
const LEGACY_REPAIR_VERSION = 2
const UNLABELLED_REASON = 'Assign the required labels before confirmation.'

/**
 * Moves every historical entry into the ingestion worklist.
 *
 * "Move", not "copy": a row whose labels nobody has confirmed must not sit in a
 * finance table, because the labels are what decide where it belongs. The queued
 * row keeps the complete original values, so confirming its labels writes it back
 * into the destination table it names.
 */
export async function migrateExistingEntriesToIngestion(): Promise<{ queued: number; skipped: number }> {
  let source = (await ingestionSourcesTable.toArray()).find((row) => (row.data as IngestionSource).sourceFingerprint === LEGACY_FINGERPRINT)
  if (!source) {
    const sourceId = await ingestionSourcesTable.add({ createdAt: Date.now(), data: { originalFilename: 'Existing data migration', sourceFingerprint: LEGACY_FINGERPRINT, importedAt: Date.now(), rawCsv: '', originalColumns: [], supplementalColumns: [], rowCount: 0, status: 'staged', legacy: true, repairVersion: LEGACY_REPAIR_VERSION } satisfies IngestionSource })
    source = (await ingestionSourcesTable.get(sourceId))!
  }
  const sourceId = source.id
  const tableDefs = new Map((await tableDefsTable.toArray()).map((row) => [row.id, row.data as TableDef]))
  const existingRows = await ingestionRowsTable.toArray()
  const queuedFingerprints = new Set(existingRows.map((row) => (row.data as IngestionRow).sourceRowFingerprint))
  const labelledEntryIds = new Set((await entryLabelsTable.toArray()).map((row) => (row.data as { entryId?: number }).entryId).filter((id): id is number => typeof id === 'number'))
  const pending: IngestionRow[] = []
  const movedEntryIds: number[] = []
  let skipped = 0
  for (const stored of await entriesTable.toArray()) {
    const entry = stored.data as Entry
    // A labelled entry has already been through the worklist and stays put.
    if (labelledEntryIds.has(stored.id)) { skipped += 1; continue }
    const table = tableDefs.get(entry.tableId)
    if (!table || queuedFingerprints.has(`legacy-entry-${stored.id}`)) { skipped += 1; continue }
    const rawValues = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'tableId').map(([key, value]) => [key, String(value ?? '')]))
    // Historical data is merely staged. It must never acquire inferred labels or
    // become ready without an explicit review in the ingestion centre.
    pending.push({ sourceId, sourceRowIndex: stored.id, sourceRowFingerprint: `legacy-entry-${stored.id}`, rawValues, mappedValues: { ...entry } as IngestionRow['mappedValues'], labels: {}, destinationTableId: entry.tableId, status: 'unlabelled', validationErrors: [UNLABELLED_REASON] })
    movedEntryIds.push(stored.id)
  }

  // Repair databases written by earlier versions of this migration, which guessed
  // labels and left the original entry in its finance table. Guarded by the source's
  // repair version so a later run never discards labels assigned since, and never
  // deletes an entry whose labels the user has confirmed.
  if ((source.data as IngestionSource).repairVersion !== LEGACY_REPAIR_VERSION) {
    for (const stored of existingRows) {
      const row = stored.data as IngestionRow
      if (row.sourceId !== sourceId || row.status === 'promoted' || row.status === 'reconciledExisting') continue
      if (row.existingEntryId && !labelledEntryIds.has(row.existingEntryId)) movedEntryIds.push(row.existingEntryId)
      const { existingEntryId: _linked, ...rest } = row
      await ingestionRowsTable.update(stored.id, { data: { ...rest, labels: {}, labelValues: {}, status: 'unlabelled', validationErrors: [UNLABELLED_REASON] } })
    }
    await ingestionSourcesTable.update(sourceId, { data: { ...(source.data as IngestionSource), repairVersion: LEGACY_REPAIR_VERSION } })
  }

  if (pending.length) await ingestionRowsTable.bulkAdd(pending.map((row) => ({ createdAt: Date.now(), data: row })))
  if (movedEntryIds.length) await entriesTable.bulkDelete(movedEntryIds)
  await ingestionAuditEventsTable.add({ createdAt: Date.now(), data: { event: 'rowsStaged', actor: 'migration', sourceId, entryIds: movedEntryIds, details: { queued: pending.length, skipped, movedOutOfTables: movedEntryIds.length } } })
  return { queued: pending.length, skipped }
}
