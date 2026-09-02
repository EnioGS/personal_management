import { ingestionLabelErrors } from '@/lib/model/ingestion'
import { createSupplementalColumn, saveIngestionMappings, stageIngestionSource } from '@/lib/model/ingestion-source'
import { updateIngestionRowLabels, updateIngestionRowWorklist } from '@/lib/model/ingestion-promotion'
import { categoriesTable, categoryRulesTable, ingestionColumnMappingsTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from '@/lib/model/model-db'
import { findMatchingCategoryRule } from '@/lib/model/category-resolver'
import type { IngestionColumnMapping, IngestionRow, IngestionRowLabels, IngestionTargetField } from '@/lib/model/types'
import type { ToolDefinition } from './types'

const MAX_ROWS = 100
const TARGET_FIELDS: IngestionTargetField[] = ['date', 'amount', 'description', 'rawCategory', 'direction', 'asset', 'investmentType', 'quantity', 'price', 'note', 'destination', 'financeDestinations', 'flowRole', 'settlementChannel', 'spendingTreatment', 'categoryId', 'recurrence', 'destinationTableId']

export const listIngestionDatasetsTool: ToolDefinition = {
  name: 'list_ingestion_datasets',
  description: 'Lists the imported-unlabelled worklist and uploaded CSV sources with original filenames, source IDs, mapping state, row count, and ready-row count. Read-only.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => {
    const [sources, rows] = await Promise.all([ingestionSourcesTable.toArray(), ingestionRowsTable.toArray()])
    const active = rows.map((row) => row.data as IngestionRow).filter((row) => row.status !== 'promoted' && row.status !== 'reconciledExisting')
    return JSON.stringify({ unlabelled: { count: active.length, ready: active.filter((row) => row.status === 'ready').length }, sources: sources.map((source) => ({ id: source.id, ...(source.data as object) })) })
  },
}

export const readIngestionTableTool: ToolDefinition = {
  name: 'read_ingestion_table',
  description: 'Reads a paged slice of the imported-unlabelled worklist or one uploaded source, including its original filename, raw values, mappings, labels, status and validation errors. Read-only; use offset/limit for large datasets.',
  parameters: { type: 'object', properties: { sourceId: { type: 'number', description: 'Uploaded source ID. Omit to read imported unlabelled rows.' }, offset: { type: 'number' }, limit: { type: 'number' } }, additionalProperties: false },
  execute: async (args) => {
    const offset = typeof args.offset === 'number' && args.offset >= 0 ? Math.floor(args.offset) : 0
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(MAX_ROWS, Math.floor(args.limit)) : 25
    const sourceId = typeof args.sourceId === 'number' ? args.sourceId : undefined
    const rows = (await ingestionRowsTable.toArray()).map((row) => ({ id: row.id, ...(row.data as IngestionRow) }))
    const selected = rows.filter((row) => sourceId === undefined ? row.status !== 'promoted' && row.status !== 'reconciledExisting' : row.sourceId === sourceId)
    const source = sourceId === undefined ? undefined : await ingestionSourcesTable.get(sourceId)
    const mappings = sourceId === undefined ? [] : (await ingestionColumnMappingsTable.toArray()).filter((row) => (row.data as IngestionColumnMapping).sourceId === sourceId).map((row) => row.data)
    return JSON.stringify({ source: source ? { id: source.id, ...(source.data as object) } : sourceId === undefined ? 'Imported, unlabelled data' : null, total: selected.length, offset, rows: selected.slice(offset, offset + limit), mappings })
  },
}

export const assignIngestionColumnsTool: ToolDefinition = {
  name: 'assign_ingestion_columns',
  description: 'Assigns, changes, or clears canonical field mappings for an uploaded source. Inspect the source with read_ingestion_table first. This changes mapping metadata only; it does not stage or promote rows. Reject ambiguous assignments and report missing required fields.',
  parameters: { type: 'object', properties: { sourceId: { type: 'number' }, mappings: { type: 'array', items: { type: 'object', properties: { sourceColumn: { type: 'string' }, targetField: { type: 'string', enum: TARGET_FIELDS } }, required: ['sourceColumn', 'targetField'] } } }, required: ['sourceId', 'mappings'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number' || !Array.isArray(args.mappings)) return 'Error: sourceId and mappings are required.'
    try {
      const mappings = args.mappings.map((item) => ({ sourceId: args.sourceId as number, sourceColumn: String((item as Record<string, unknown>).sourceColumn ?? ''), targetField: (item as Record<string, unknown>).targetField as IngestionTargetField }))
      const result = await saveIngestionMappings(args.sourceId, mappings)
      return JSON.stringify(result)
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not assign mappings.'}` }
  },
}

export const addIngestionBlankColumnTool: ToolDefinition = {
  name: 'add_ingestion_blank_column',
  description: 'Adds an explicitly blank supplemental column to a sparse uploaded source so it can satisfy a possible future destination. This does not alter the original CSV; inspect the source first and explain why the blank field is needed.',
  parameters: { type: 'object', properties: { sourceId: { type: 'number' }, name: { type: 'string' } }, required: ['sourceId', 'name'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number' || typeof args.name !== 'string') return 'Error: sourceId and name are required.'
    try { return JSON.stringify(await createSupplementalColumn(args.sourceId, args.name)) } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not add blank column.'}` }
  },
}

export const stageIngestionSourceTool: ToolDefinition = {
  name: 'stage_ingestion_source',
  description: 'Validates a fully mapped source and stages it in Imported, unlabelled data. Use only after you have described the intended mapping to the user. Reports duplicates and never promotes data into a Finance table.',
  parameters: { type: 'object', properties: { sourceId: { type: 'number' } }, required: ['sourceId'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number') return 'Error: sourceId is required.'
    try { return JSON.stringify(await stageIngestionSource(args.sourceId)) } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not stage source.'}` }
  },
}

export const updateIngestionLabelsTool: ToolDefinition = {
  name: 'update_ingestion_labels',
  description: 'Sets or clears labels and the destination table for explicit imported rows. First inspect rows with read_ingestion_table. Reports each row’s readiness; this tool cannot confirm or promote rows into Finance tables.',
  parameters: { type: 'object', properties: { updates: { type: 'array', items: { type: 'object', properties: { rowId: { type: 'number' }, labels: { type: 'object' }, destinationTableId: { type: 'number' } }, required: ['rowId', 'labels'] } } }, required: ['updates'], additionalProperties: false },
  execute: async (args) => {
    if (!Array.isArray(args.updates)) return 'Error: updates are required.'
    const result: unknown[] = []
    for (const update of args.updates as Record<string, unknown>[]) {
      if (typeof update.rowId !== 'number' || typeof update.labels !== 'object' || update.labels === null) { result.push({ error: 'rowId and labels are required.' }); continue }
      try { result.push(await updateIngestionRowLabels(update.rowId, update.labels as IngestionRowLabels, typeof update.destinationTableId === 'number' ? update.destinationTableId : undefined, 'assistant')) } catch (error) { result.push({ rowId: update.rowId, error: error instanceof Error ? error.message : 'could not update labels.' }) }
    }
    return JSON.stringify(result)
  },
}

export const updateIngestionDataFieldsTool: ToolDefinition = {
  name: 'update_ingestion_data_fields',
  description: 'Edits canonical data fields on explicit unfinalized ingestion rows. Use it to correct a mapped value or add a missing field such as quantity during labelling. Read the rows first. This never promotes data; the user alone confirms promotion.',
  parameters: { type: 'object', properties: { updates: { type: 'array', items: { type: 'object', properties: { rowId: { type: 'number' }, values: { type: 'object', additionalProperties: { type: 'string' } }, }, required: ['rowId', 'values'] } } }, required: ['updates'], additionalProperties: false },
  execute: async (args) => {
    if (!Array.isArray(args.updates)) return 'Error: updates are required.'
    const result: unknown[] = []
    for (const update of args.updates as Record<string, unknown>[]) {
      if (typeof update.rowId !== 'number' || typeof update.values !== 'object' || update.values === null) { result.push({ error: 'rowId and values are required.' }); continue }
      const values = Object.fromEntries(Object.entries(update.values as Record<string, unknown>).filter(([field]) => TARGET_FIELDS.includes(field as IngestionTargetField)).map(([field, value]) => [field, String(value ?? '')]))
      try { result.push(await updateIngestionRowWorklist(update.rowId, { mappedValues: values }, 'assistant')) } catch (error) { result.push({ rowId: update.rowId, error: error instanceof Error ? error.message : 'could not update data fields.' }) }
    }
    return JSON.stringify(result)
  },
}

export const validateIngestionRowsTool: ToolDefinition = {
  name: 'validate_ingestion_rows',
  description: 'Returns readiness and label blockers for explicit imported row IDs. Read-only; use it before telling the user which rows are ready for the user-only confirmation action.',
  parameters: { type: 'object', properties: { rowIds: { type: 'array', items: { type: 'number' } } }, required: ['rowIds'], additionalProperties: false },
  execute: async (args) => {
    if (!Array.isArray(args.rowIds)) return 'Error: rowIds are required.'
    const result = []
    for (const id of args.rowIds) {
      if (typeof id !== 'number') continue
      const stored = await ingestionRowsTable.get(id)
      if (!stored) { result.push({ id, error: 'not found' }); continue }
      const row = stored.data as IngestionRow
      result.push({ id, status: row.status, errors: row.validationErrors.length ? row.validationErrors : ingestionLabelErrors(row.labels, row.destinationTableId) })
    }
    return JSON.stringify(result)
  },
}

export const suggestIngestionLabelsTool: ToolDefinition = {
  name: 'suggest_ingestion_labels',
  description: 'Returns read-only, evidence-based category suggestions for explicit ingestion row IDs using current category rules and the row raw values. Never applies labels. Treat IOF and Pix as uncertain unless the available evidence clearly establishes the meaning.',
  parameters: { type: 'object', properties: { rowIds: { type: 'array', items: { type: 'number' } } }, required: ['rowIds'], additionalProperties: false },
  execute: async (args) => {
    if (!Array.isArray(args.rowIds)) return 'Error: rowIds are required.'
    const [categories, rules, tables] = await Promise.all([categoriesTable.toArray(), categoryRulesTable.toArray(), tableDefsTable.toArray()])
    const tableById = new Map(tables.map((table) => [table.id, table.data as { kind?: never }]))
    const result = []
    for (const id of args.rowIds) {
      if (typeof id !== 'number') continue
      const stored = await ingestionRowsTable.get(id)
      if (!stored) { result.push({ id, error: 'not found' }); continue }
      const row = stored.data as IngestionRow
      const raw = String(row.mappedValues.rawCategory ?? row.rawValues.category ?? row.rawValues.description ?? '')
      const rule = findMatchingCategoryRule(categories.map((row) => ({ id: row.id, createdAt: row.createdAt, ...(row.data as object) })) as never, rules.map((row) => ({ id: row.id, createdAt: row.createdAt, ...(row.data as object) })) as never, raw, tableById.get(row.destinationTableId ?? 0)?.kind)
      result.push({ id, rawCategory: raw, suggestedCategoryId: rule?.categoryId ?? null, matchingString: rule?.pattern ?? null, note: 'Suggestion only; review before applying.' })
    }
    return JSON.stringify(result)
  },
}
