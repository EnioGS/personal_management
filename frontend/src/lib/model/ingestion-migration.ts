import { ingestionLabelErrors } from './ingestion'
import { entriesTable, entryLabelsTable, ingestionAuditEventsTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from './model-db'
import type { Entry, IngestionRow, IngestionRowLabels, IngestionSource, TableDef } from './types'

const LEGACY_FINGERPRINT = 'existing-app-data-v1'

function suggestedLabels(table: TableDef, entry: Entry): IngestionRowLabels {
  if (table.kind === 'bankLedger') {
    return { financeDestinations: ['movements'], flowRole: entry.direction === 'in' ? 'inflow' : entry.direction === 'out' ? 'outflow' : undefined, settlementChannel: 'checkingAccount', spendingTreatment: 'notApplicable', recurrence: 'unknown' }
  }
  if (table.kind === 'investmentLedger') {
    return { financeDestinations: ['movements', 'investments'], flowRole: 'adjustment', settlementChannel: 'investment', spendingTreatment: 'notApplicable', recurrence: 'unknown' }
  }
  if (table.kind === 'cardLedger') {
    // Card rows need human review for expense versus rebate; do not silently decide.
    return { financeDestinations: ['movements', 'spending'], flowRole: 'outflow', settlementChannel: 'creditCard', recurrence: 'unknown' }
  }
  return { financeDestinations: ['movements'], settlementChannel: 'other', recurrence: 'unknown' }
}

/** Queues active historical entries once, linked by existingEntryId so reconciliation cannot insert duplicates. */
export async function migrateExistingEntriesToIngestion(): Promise<{ queued: number; skipped: number }> {
  let source = (await ingestionSourcesTable.toArray()).find((row) => (row.data as IngestionSource).sourceFingerprint === LEGACY_FINGERPRINT)
  if (!source) {
    const sourceId = await ingestionSourcesTable.add({ createdAt: Date.now(), data: { originalFilename: 'Existing data migration', sourceFingerprint: LEGACY_FINGERPRINT, importedAt: Date.now(), rawCsv: '', originalColumns: [], supplementalColumns: [], rowCount: 0, status: 'staged', legacy: true } satisfies IngestionSource })
    source = (await ingestionSourcesTable.get(sourceId))!
  }
  const sourceId = source.id
  const tableDefs = new Map((await tableDefsTable.toArray()).map((row) => [row.id, row.data as TableDef]))
  const existingIds = new Set((await ingestionRowsTable.toArray()).map((row) => (row.data as IngestionRow).existingEntryId).filter((id): id is number => typeof id === 'number'))
  const labelledEntryIds = new Set((await entryLabelsTable.toArray()).map((row) => (row.data as { entryId?: number }).entryId).filter((id): id is number => typeof id === 'number'))
  const pending: IngestionRow[] = []
  let skipped = 0
  for (const stored of await entriesTable.toArray()) {
    const entry = stored.data as Entry
    if (entry.deleted || existingIds.has(stored.id) || labelledEntryIds.has(stored.id)) { skipped += 1; continue }
    const table = tableDefs.get(entry.tableId)
    if (!table) { skipped += 1; continue }
    const rawValues = Object.fromEntries(Object.entries(entry).filter(([key]) => key !== 'tableId').map(([key, value]) => [key, String(value ?? '')]))
    const labels = suggestedLabels(table, entry)
    const row: IngestionRow = { sourceId, sourceRowIndex: stored.id, sourceRowFingerprint: `legacy-entry-${stored.id}`, rawValues, mappedValues: { ...entry } as IngestionRow['mappedValues'], labels, destinationTableId: entry.tableId, status: 'unlabelled', validationErrors: [] , existingEntryId: stored.id }
    row.validationErrors = ingestionLabelErrors(labels, row.destinationTableId)
    row.status = row.validationErrors.length ? 'unlabelled' : 'ready'
    pending.push(row)
  }
  if (pending.length) await ingestionRowsTable.bulkAdd(pending.map((row) => ({ createdAt: Date.now(), data: row })))
  await ingestionAuditEventsTable.add({ createdAt: Date.now(), data: { event: 'rowsStaged', actor: 'migration', sourceId, ingestionRowIds: [], details: { queued: pending.length, skipped } } })
  return { queued: pending.length, skipped }
}
