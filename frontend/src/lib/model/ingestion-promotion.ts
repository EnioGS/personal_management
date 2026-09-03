import { coerceValue } from '@/lib/csv'
import type { ColumnDef } from '@/lib/table-schema'
import { TABLE_KIND_SCHEMAS } from './table-kinds'
import { entryLabelsFromIngestionRow, ingestionLabelErrors } from './ingestion'
import {
  categoriesTable,
  entryLabelsTable,
  entriesTable,
  ingestionAuditEventsTable,
  ingestionRowsTable,
  tableDefsTable,
} from './model-db'
import type { Entry, IngestionRow, IngestionRowLabels, IngestionRowLabelValues, TableDef } from './types'

const MAPPED_FIELD_FOR_ENTRY_FIELD: Record<string, string> = {
  date: 'date',
  direction: 'direction',
  category: 'rawCategory',
  description: 'description',
  amount: 'amount',
  asset: 'asset',
  type: 'investmentType',
  quantity: 'quantity',
  price: 'price',
  note: 'note',
  destination: 'destination',
}

function asIngestionRow(value: unknown): IngestionRow {
  return value as IngestionRow
}

function flowDirection(row: IngestionRow): string {
  return row.labels.flowRole === 'inflow' ? 'in' : 'out'
}

/**
 * Mapped values are not always text. A CSV supplies strings, but the legacy migration
 * carries the entry's own values across, where a date is already epoch milliseconds and
 * an amount is already a number — stringifying those and re-parsing them would reject
 * every migrated row ("1725148800000" is not a date any parser accepts).
 */
function coerceMappedValue(column: ColumnDef<Entry>, raw: unknown) {
  if (typeof raw === 'number' && Number.isFinite(raw) && (column.type === 'date' || column.type === 'number')) {
    return { ok: true as const, value: raw }
  }
  return coerceValue(column, raw === undefined || raw === null ? '' : String(raw))
}

async function entryFromIngestionRow(row: IngestionRow): Promise<Entry> {
  if (!row.destinationTableId) throw new Error('Choose a destination table.')
  const definitionRow = await tableDefsTable.get(row.destinationTableId)
  if (!definitionRow) throw new Error('The selected destination table no longer exists.')
  const definition = definitionRow.data as TableDef
  const schema = TABLE_KIND_SCHEMAS[definition.kind]
  const category = row.labels.categoryId ? await categoriesTable.get(row.labels.categoryId) : undefined
  const categoryName = category ? (category.data as { name: string }).name : undefined
  const entry: Record<string, unknown> = { tableId: row.destinationTableId }

  for (const column of schema) {
    const entryField = String(column.key)
    const mappedField = MAPPED_FIELD_FOR_ENTRY_FIELD[entryField]
    let raw = mappedField ? row.mappedValues[mappedField as keyof typeof row.mappedValues] : undefined
    if (entryField === 'direction' && (!raw || String(raw).trim() === '')) raw = flowDirection(row)
    if (entryField === 'category' && categoryName) raw = categoryName
    const result = coerceMappedValue(column, raw)
    if (!result.ok) throw new Error(result.message)
    entry[entryField] = result.value
  }
  // The source-row fingerprint travels with the promoted entry so re-importing the
  // same statement still recognises the row it already produced.
  const importKey = row.rawValues.importKey ?? row.sourceRowFingerprint
  if (importKey) entry.importKey = importKey
  return entry as Entry
}

async function validateAndSave(
  rowId: number,
  next: IngestionRow,
  actor: 'user' | 'assistant',
): Promise<IngestionRow> {
  const errors = ingestionLabelErrors(next.labels, next.destinationTableId)
  if (errors.length === 0) {
    try {
      await entryFromIngestionRow(next)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'The destination table rejected this row.')
    }
  }
  next.validationErrors = errors
  next.status = errors.length === 0 ? 'ready' : next.labels.financeDestination || Object.values(next.labelValues ?? {}).some(Boolean) ? 'invalid' : 'unlabelled'
  await ingestionRowsTable.update(rowId, { data: next })
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'labelsChanged', actor, sourceId: next.sourceId, ingestionRowIds: [rowId], details: { status: next.status, errors } },
  })
  return next
}

function isFinalized(row: IngestionRow): boolean {
  return row.status === 'promoted' || row.status === 'reconciledExisting'
}

/**
 * Records an edit to a row whose entry already exists. The live entry is deliberately
 * left alone: a confirmed row keeps showing what it currently shows on every dashboard
 * until the user clicks reallocate, exactly as a staged row waits for promotion.
 */
async function saveConfirmedEdit(rowId: number, next: IngestionRow, actor: 'user' | 'assistant'): Promise<IngestionRow> {
  const errors = ingestionLabelErrors(next.labels, next.destinationTableId)
  if (errors.length === 0) {
    try {
      await entryFromIngestionRow(next)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'The destination table rejected this row.')
    }
  }
  next.validationErrors = errors
  next.hasPendingChange = true
  await ingestionRowsTable.update(rowId, { data: next })
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'labelsChanged', actor, sourceId: next.sourceId, ingestionRowIds: [rowId], details: { pendingReallocation: true, errors } },
  })
  return next
}

/** Validates labels and destination data, transitioning the row only between unlabelled/ready/invalid. */
export async function updateIngestionRowLabels(
  rowId: number,
  labels: IngestionRowLabels,
  destinationTableId?: number,
  actor: 'user' | 'assistant' = 'user',
): Promise<IngestionRow> {
  const stored = await ingestionRowsTable.get(rowId)
  if (!stored) throw new Error(`Ingestion row ${rowId} was not found.`)
  const current = asIngestionRow(stored.data)
  const next = { ...current, labels, destinationTableId }
  return isFinalized(current) ? saveConfirmedEdit(rowId, next, actor) : validateAndSave(rowId, next, actor)
}

/**
 * Saves editable worklist cells. Mapped fields may be created on demand, which
 * lets a sparse source acquire e.g. quantity during label review without
 * altering the preserved original CSV.
 */
export async function updateIngestionRowWorklist(
  rowId: number,
  patch: { mappedValues?: Partial<IngestionRow['mappedValues']>; labels?: IngestionRowLabels; labelValues?: IngestionRowLabelValues; destinationTableId?: number | null },
  actor: 'user' | 'assistant' = 'user',
): Promise<IngestionRow> {
  const stored = await ingestionRowsTable.get(rowId)
  if (!stored) throw new Error(`Ingestion row ${rowId} was not found.`)
  const current = asIngestionRow(stored.data)
  const next: IngestionRow = {
    ...current,
    mappedValues: { ...current.mappedValues, ...patch.mappedValues },
    labels: patch.labels ?? current.labels,
    labelValues: patch.labelValues ?? current.labelValues,
    destinationTableId: patch.destinationTableId === undefined ? current.destinationTableId : patch.destinationTableId ?? undefined,
  }
  return isFinalized(current) ? saveConfirmedEdit(rowId, next, actor) : validateAndSave(rowId, next, actor)
}

/** Finalize rows already marked ready. This is called only from the user-confirmed UI action. */
export async function promoteReadyIngestionRows(rowIds: number[]): Promise<{ promoted: number; reconciled: number; errors: string[] }> {
  const ids = [...new Set(rowIds)]
  const result = { promoted: 0, reconciled: 0, errors: [] as string[] }
  const now = Date.now()
  const preparedEntries = new Map<number, Entry>()
  const preparationErrors = new Map<number, string>()

  // Table/category reads happen before the write transaction. Dexie requires every
  // table touched inside a transaction to be declared up front, and promotion's
  // transactional scope intentionally contains only the records it changes.
  for (const rowId of ids) {
    const stored = await ingestionRowsTable.get(rowId)
    const row = stored ? asIngestionRow(stored.data) : undefined
    if (!row || row.status !== 'ready' || row.existingEntryId) continue
    try {
      preparedEntries.set(rowId, await entryFromIngestionRow(row))
    } catch (error) {
      preparationErrors.set(rowId, error instanceof Error ? error.message : 'Promotion failed.')
    }
  }

  await entriesTable.db.transaction('rw', entriesTable, entryLabelsTable, ingestionRowsTable, ingestionAuditEventsTable, async () => {
    for (const rowId of ids) {
      const stored = await ingestionRowsTable.get(rowId)
      if (!stored) {
        result.errors.push(`Row ${rowId} no longer exists.`)
        continue
      }
      const row = asIngestionRow(stored.data)
      if (row.status !== 'ready') {
        result.errors.push(`Row ${rowId} is not ready for promotion.`)
        continue
      }

      try {
        const preparationError = preparationErrors.get(rowId)
        if (preparationError) throw new Error(preparationError)
        if (row.existingEntryId) {
          const labels = entryLabelsFromIngestionRow(row.existingEntryId, row)
          const previous = (await entryLabelsTable.toArray()).find((candidate) => (candidate.data as { entryId?: number }).entryId === row.existingEntryId)
          if (previous) await entryLabelsTable.update(previous.id, { data: { ...labels, sourceIngestionRowId: rowId } })
          else await entryLabelsTable.add({ createdAt: now, data: { ...labels, sourceIngestionRowId: rowId } })
          await ingestionRowsTable.update(rowId, { data: { ...row, status: 'reconciledExisting' } })
          result.reconciled += 1
        } else {
          const entry = preparedEntries.get(rowId)
          if (!entry) throw new Error('The destination entry could not be prepared.')
          const entryId = await entriesTable.add({ createdAt: now, data: entry })
          await entryLabelsTable.add({ createdAt: now, data: { ...entryLabelsFromIngestionRow(entryId, row), sourceIngestionRowId: rowId } })
          await ingestionRowsTable.update(rowId, { data: { ...row, promotedEntryId: entryId, status: 'promoted' } })
          result.promoted += 1
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Promotion failed.'
        result.errors.push(`Row ${rowId}: ${message}`)
        await ingestionRowsTable.update(rowId, { data: { ...row, status: 'promotionError', validationErrors: [message] } })
      }
    }

    await ingestionAuditEventsTable.add({
      createdAt: now,
      data: {
        event: result.errors.length ? 'promotionFailed' : 'rowsPromoted',
        actor: 'user',
        ingestionRowIds: ids,
        details: result,
      },
    })
  })
  return result
}

/**
 * Applies edits made to already-confirmed rows: the promoted entry is rewritten in
 * place — same entry id, so budgets, positions and provenance links survive — against
 * whichever destination table the row now names, and its labels are rewritten with it.
 *
 * This is how a row is moved between Finance surfaces after the fact. It is the second
 * user-only action, for the same reason promotion is: it is the moment stored data
 * changes. A row whose edit does not validate keeps its errors and is left untouched,
 * so a half-relabelled row can never land in a table that cannot hold it.
 */
export async function reallocateConfirmedIngestionRows(rowIds: number[]): Promise<{ reallocated: number; errors: string[] }> {
  const ids = [...new Set(rowIds)]
  const result = { reallocated: 0, errors: [] as string[] }
  const now = Date.now()
  const prepared = new Map<number, { entryId: number; entry: Entry; row: IngestionRow }>()

  // Table and category reads happen before the write transaction: Dexie requires every
  // table a transaction touches to be declared up front.
  for (const rowId of ids) {
    const stored = await ingestionRowsTable.get(rowId)
    const row = stored ? asIngestionRow(stored.data) : undefined
    if (!row) { result.errors.push(`Row ${rowId} no longer exists.`); continue }
    if (!isFinalized(row) || !row.hasPendingChange) continue
    const entryId = row.promotedEntryId ?? row.existingEntryId
    if (!entryId) { result.errors.push(`Row ${rowId} has no confirmed entry to update.`); continue }
    if (row.validationErrors.length > 0) { result.errors.push(`Row ${rowId}: ${row.validationErrors[0]}`); continue }
    try {
      prepared.set(rowId, { entryId, entry: await entryFromIngestionRow(row), row })
    } catch (error) {
      result.errors.push(`Row ${rowId}: ${error instanceof Error ? error.message : 'could not be reallocated.'}`)
    }
  }

  if (prepared.size === 0) return result

  await entriesTable.db.transaction('rw', entriesTable, entryLabelsTable, ingestionRowsTable, ingestionAuditEventsTable, async () => {
    const allLabels = await entryLabelsTable.toArray()
    for (const [rowId, { entryId, entry, row }] of prepared) {
      try {
        if (!(await entriesTable.get(entryId))) throw new Error('the confirmed entry no longer exists.')
        await entriesTable.update(entryId, { data: entry })
        const labels = { ...entryLabelsFromIngestionRow(entryId, row), sourceIngestionRowId: rowId }
        const previous = allLabels.find((candidate) => (candidate.data as { entryId?: number }).entryId === entryId)
        if (previous) await entryLabelsTable.update(previous.id, { data: labels })
        else await entryLabelsTable.add({ createdAt: now, data: labels })
        await ingestionRowsTable.update(rowId, { data: { ...row, hasPendingChange: false, validationErrors: [] } })
        result.reallocated += 1
      } catch (error) {
        result.errors.push(`Row ${rowId}: ${error instanceof Error ? error.message : 'could not be reallocated.'}`)
      }
    }

    await ingestionAuditEventsTable.add({
      createdAt: now,
      data: { event: 'rowsReallocated', actor: 'user', ingestionRowIds: [...prepared.keys()], entryIds: [...prepared.values()].map(({ entryId }) => entryId), details: result },
    })
  })
  return result
}

/**
 * Sets rows aside without deleting them. A discarded row keeps every raw value and
 * stays readable as provenance — it simply leaves the worklist and can never be
 * promoted, which is what "this is a duplicate" should mean for data nobody wants to
 * lose. Restoring puts it back where it was.
 *
 * A row already in a Finance table is refused: discarding it would silently remove a
 * real entry, which is a different act than tidying a queue.
 */
export async function discardIngestionRows(
  rowIds: number[],
  reason: string,
  actor: 'user' | 'assistant' = 'user',
  restore = false,
): Promise<{ changed: number; errors: string[] }> {
  const result = { changed: 0, errors: [] as string[] }
  for (const rowId of [...new Set(rowIds)]) {
    const stored = await ingestionRowsTable.get(rowId)
    if (!stored) { result.errors.push(`Row ${rowId} no longer exists.`); continue }
    const row = asIngestionRow(stored.data)
    // A confirmed row's entry is real data on a dashboard, so discarding one has to
    // take that entry out of the picture too. It is flagged rather than erased (adr/0018),
    // which is what makes restoring the row put the entry back.
    // Restoring works from the discarded status, not the finalized one, so the entry
    // has to be found by the link the row still carries either way.
    const entryId = row.promotedEntryId ?? row.existingEntryId
    const touchesEntry = entryId !== undefined && (restore ? row.status === 'discarded' : isFinalized(row))
    if (touchesEntry) {
      const entry = await entriesTable.get(entryId!)
      if (entry) await entriesTable.update(entryId!, { data: { ...(entry.data as Entry), deleted: !restore } })
    }
    if (restore) {
      if (row.status !== 'discarded') continue
      const { discardReason: _reason, ...rest } = row
      // A row that had reached a table goes back to being confirmed; one that never did
      // goes back to the worklist.
      const restoredStatus = rest.promotedEntryId ? 'promoted' : rest.existingEntryId ? 'reconciledExisting' : 'unlabelled'
      await ingestionRowsTable.update(rowId, { data: { ...rest, status: restoredStatus, validationErrors: restoredStatus === 'unlabelled' ? ['Assign the required labels before confirmation.'] : [] } })
    } else {
      if (row.status === 'discarded') continue
      await ingestionRowsTable.update(rowId, { data: { ...row, status: 'discarded', discardReason: reason, validationErrors: [] } })
    }
    result.changed += 1
  }
  if (result.changed > 0) {
    await ingestionAuditEventsTable.add({
      createdAt: Date.now(),
      data: { event: 'rowsDiscarded', actor, ingestionRowIds: rowIds, details: { restored: restore, reason, changed: result.changed } },
    })
  }
  return result
}
