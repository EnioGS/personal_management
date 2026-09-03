import type { IngestionRow, TableDef } from './types'

/**
 * One flat name for anything a question can be asked about a staged row, so a filter
 * reads like the column it means rather than like the shape it is stored in.
 *
 * `description` looks at the mapped value and falls back to the raw one, because a
 * source that has not been mapped yet still has the text a rule needs to match.
 * `raw.<column>` and `mapped.<field>` address anything this list does not name.
 */
export const INGESTION_QUERY_FIELDS = [
  'date', 'amount', 'description', 'rawCategory', 'note', 'asset', 'quantity', 'price', 'investmentType', 'direction', 'destination',
  'status', 'source', 'destinationTable', 'discardReason',
  'financeDestination', 'flowRole', 'settlementChannel', 'spendingTreatment', 'recurrence', 'category',
] as const

export interface IngestionFieldContext {
  sourceNameById: Map<number, string>
  tableNameById: Map<number, string>
  categoryNameById: Map<number, string>
}

export function resolveIngestionField(row: IngestionRow, field: string, context: IngestionFieldContext): unknown {
  if (field.startsWith('raw.')) return row.rawValues[field.slice(4)]
  if (field.startsWith('mapped.')) return row.mappedValues[field.slice(7) as keyof IngestionRow['mappedValues']]
  if (field.startsWith('label.')) return resolveIngestionField(row, field.slice(6), context)

  switch (field) {
    case 'status': return row.status
    case 'discardReason': return row.discardReason
    case 'source': return context.sourceNameById.get(row.sourceId) ?? row.sourceFilename ?? ''
    case 'destinationTable': return row.destinationTableId ? (context.tableNameById.get(row.destinationTableId) ?? '') : ''
    case 'category': return row.labels.categoryId ? (context.categoryNameById.get(row.labels.categoryId) ?? '') : ''
    case 'financeDestination': return row.labels.financeDestination
    case 'flowRole': return row.labels.flowRole
    case 'settlementChannel': return row.labels.settlementChannel
    case 'spendingTreatment': return row.labels.spendingTreatment
    case 'recurrence': return row.labels.recurrence
    case 'description': return row.mappedValues.description ?? row.rawValues.description ?? ''
    case 'rawCategory': return row.mappedValues.rawCategory ?? row.rawValues.category ?? ''
    default: return row.mappedValues[field as keyof IngestionRow['mappedValues']] ?? row.rawValues[field]
  }
}

/** Builds the name lookups a resolver needs, once per query rather than once per row. */
export function ingestionFieldContext(
  sources: { id: number; data: unknown }[],
  tables: { id: number; data: unknown }[],
  categories: { id: number; data: unknown }[],
): IngestionFieldContext {
  return {
    sourceNameById: new Map(sources.map((source) => [source.id, (source.data as { originalFilename: string }).originalFilename])),
    tableNameById: new Map(tables.map((table) => [table.id, (table.data as TableDef).name])),
    categoryNameById: new Map(categories.map((category) => [category.id, (category.data as { name: string }).name])),
  }
}
