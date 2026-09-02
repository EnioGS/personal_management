import { coerceValue } from '@/lib/csv'
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
import type { Entry, IngestionRow, IngestionRowLabels, TableDef } from './types'

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
    const result = coerceValue(column, raw === undefined || raw === null ? '' : String(raw))
    if (!result.ok) throw new Error(result.message)
    entry[entryField] = result.value
  }
  return entry as Entry
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
  if (current.status === 'promoted' || current.status === 'reconciledExisting') throw new Error('This row has already been finalized.')
  const next: IngestionRow = { ...current, labels, destinationTableId }
  const errors = ingestionLabelErrors(labels, destinationTableId)
  if (errors.length === 0) {
    try {
      await entryFromIngestionRow(next)
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'The destination table rejected this row.')
    }
  }
  next.validationErrors = errors
  next.status = errors.length === 0 ? 'ready' : labels.financeDestinations ? 'invalid' : 'unlabelled'
  await ingestionRowsTable.update(rowId, { data: next })
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'labelsChanged', actor, sourceId: next.sourceId, ingestionRowIds: [rowId], details: { status: next.status, errors } },
  })
  return next
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
