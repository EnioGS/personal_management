import { DEFAULT_INGESTION_GUIDE, INGESTION_GUIDE_KEY } from '@/lib/ingestion-guide'
import { ingestionLabelErrors } from '@/lib/model/ingestion'
import { ensureCategoryByName } from '@/lib/model/category-vocabulary'
import { createSupplementalColumn, saveIngestionMappings } from '@/lib/model/ingestion-source'
import { updateIngestionRowLabels, updateIngestionRowWorklist } from '@/lib/model/ingestion-promotion'
import { FINANCE_DESTINATIONS, FLOW_ROLES, labelValues, matchLabelValue, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS } from '@/lib/model/label-vocabulary'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { categoriesTable, ingestionAuditEventsTable, ingestionColumnMappingsTable, ingestionRowsTable, ingestionSourcesTable } from '@/lib/model/model-db'
import type { AssistantPrompt } from '@/lib/assistant-prompts'
import type { Category, IngestionAuditEvent, IngestionColumnMapping, IngestionRow, IngestionRowLabels, IngestionTargetField } from '@/lib/model/types'
import type { ToolDefinition } from './types'

const MAX_ROWS = 100
const TARGET_FIELDS: IngestionTargetField[] = ['date', 'amount', 'description', 'rawCategory', 'direction', 'asset', 'investmentType', 'quantity', 'price', 'note', 'destination', 'financeDestination', 'flowRole', 'settlementChannel', 'spendingTreatment', 'categoryId', 'recurrence', 'destinationTableId']

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

export const updateIngestionLabelsTool: ToolDefinition = {
  name: 'update_ingestion_labels',
  description: `Sets or clears labels and the destination table for explicit imported rows. Read the rows first with read_ingestion_table, and read_ingestion_guide if you have not already, since every value below is closed except the category. financeDestination: ${labelValues(FINANCE_DESTINATIONS).join(' | ')}. flowRole: ${labelValues(FLOW_ROLES).join(' | ')}. settlementChannel: ${labelValues(SETTLEMENT_CHANNELS).join(' | ')}. spendingTreatment: ${labelValues(SPENDING_TREATMENTS).join(' | ')}. recurrence: ${labelValues(RECURRENCES).join(' | ')}. category is free text and a new name creates that category. Reports each row's readiness; this tool can never confirm or move rows into a Finance table — only the user can.`,
  parameters: {
    type: 'object',
    properties: {
      updates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            rowId: { type: 'number' },
            financeDestination: { type: 'string', enum: labelValues(FINANCE_DESTINATIONS) },
            flowRole: { type: 'string', enum: labelValues(FLOW_ROLES) },
            settlementChannel: { type: 'string', enum: labelValues(SETTLEMENT_CHANNELS) },
            spendingTreatment: { type: 'string', enum: labelValues(SPENDING_TREATMENTS) },
            recurrence: { type: 'string', enum: labelValues(RECURRENCES) },
            category: { type: 'string', description: 'Category name. A name that does not exist yet is created.' },
            destinationTableId: { type: 'number', description: 'Row id of the destination table, from read_table.' },
          },
          required: ['rowId'],
        },
      },
    },
    required: ['updates'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (!Array.isArray(args.updates)) return 'Error: updates are required.'
    const result: unknown[] = []
    for (const update of args.updates as Record<string, unknown>[]) {
      if (typeof update.rowId !== 'number') { result.push({ error: 'rowId is required.' }); continue }
      const stored = await ingestionRowsTable.get(update.rowId)
      if (!stored) { result.push({ rowId: update.rowId, error: 'not found' }); continue }
      const current = stored.data as IngestionRow
      const text = (field: string) => (typeof update[field] === 'string' ? (update[field] as string) : undefined)
      const categoryId = text('category') === undefined ? current.labels.categoryId : await ensureCategoryByName(text('category')!)
      const labels: IngestionRowLabels = {
        ...current.labels,
        ...(text('financeDestination') !== undefined ? { financeDestination: matchLabelValue(FINANCE_DESTINATIONS, text('financeDestination')) } : {}),
        ...(text('flowRole') !== undefined ? { flowRole: matchLabelValue(FLOW_ROLES, text('flowRole')) } : {}),
        ...(text('settlementChannel') !== undefined ? { settlementChannel: matchLabelValue(SETTLEMENT_CHANNELS, text('settlementChannel')) } : {}),
        ...(text('spendingTreatment') !== undefined ? { spendingTreatment: matchLabelValue(SPENDING_TREATMENTS, text('spendingTreatment')) } : {}),
        ...(text('recurrence') !== undefined ? { recurrence: matchLabelValue(RECURRENCES, text('recurrence')) } : {}),
        categoryId,
      }
      const destinationTableId = typeof update.destinationTableId === 'number' ? update.destinationTableId : current.destinationTableId
      try {
        const next = await updateIngestionRowLabels(update.rowId, labels, destinationTableId, 'assistant')
        result.push({ rowId: update.rowId, status: next.status, errors: next.validationErrors })
      } catch (error) { result.push({ rowId: update.rowId, error: error instanceof Error ? error.message : 'could not update labels.' }) }
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
  description: 'Returns read-only evidence for explicit ingestion row IDs: the row raw values plus how rows with a similar description or raw category were already labelled, and the current category vocabulary. It never applies labels and it is not a rule engine — weigh the evidence, and say so when IOF, Pix or a bare merchant name leaves the meaning uncertain.',
  parameters: { type: 'object', properties: { rowIds: { type: 'array', items: { type: 'number' } } }, required: ['rowIds'], additionalProperties: false },
  execute: async (args) => {
    if (!Array.isArray(args.rowIds)) return 'Error: rowIds are required.'
    const [categories, allRows] = await Promise.all([categoriesTable.toArray(), ingestionRowsTable.toArray()])
    const labelledRows = allRows.map((row) => row.data as IngestionRow).filter((row) => row.labels.financeDestination)
    const result = []
    for (const id of args.rowIds) {
      if (typeof id !== 'number') continue
      const stored = await ingestionRowsTable.get(id)
      if (!stored) { result.push({ id, error: 'not found' }); continue }
      const row = stored.data as IngestionRow
      const subject = evidenceText(row)
      const similar = labelledRows
        .filter((candidate) => sharesAWord(subject, evidenceText(candidate)))
        .slice(0, 5)
        .map((candidate) => ({ text: evidenceText(candidate), labels: candidate.labels }))
      result.push({ id, rawValues: row.rawValues, mappedValues: row.mappedValues, similarAlreadyLabelled: similar, note: 'Evidence only. Decide per row and report anything you are unsure about.' })
    }
    return JSON.stringify({ categories: categories.map((category) => (category.data as Category).name), rows: result })
  },
}

function evidenceText(row: IngestionRow): string {
  return String(row.mappedValues.description ?? row.rawValues.description ?? '') + ' ' + String(row.mappedValues.rawCategory ?? row.rawValues.category ?? '')
}

/** Deliberately crude: it surfaces neighbours as evidence, it does not classify. */
function sharesAWord(left: string, right: string): boolean {
  const words = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 3))
  const rightWords = words(right)
  return [...words(left)].some((word) => rightWords.has(word))
}

export const readIngestionProvenanceTool: ToolDefinition = {
  name: 'read_ingestion_provenance',
  description: 'Reads one ingestion row in full: its untouched raw source values, the original filename it came from, its mapped values, labels, status, and the audit trail of who changed it. Read-only. Use it before judging a row whose meaning is not obvious from the worklist columns.',
  parameters: { type: 'object', properties: { rowId: { type: 'number' } }, required: ['rowId'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.rowId !== 'number') return 'Error: rowId is required.'
    const stored = await ingestionRowsTable.get(args.rowId)
    if (!stored) return `Error: ingestion row ${args.rowId} was not found.`
    const row = stored.data as IngestionRow
    const source = await ingestionSourcesTable.get(row.sourceId)
    const events = (await ingestionAuditEventsTable.toArray())
      .filter((event) => (event.data as IngestionAuditEvent).ingestionRowIds?.includes(args.rowId as number))
      .slice(-10)
      .map((event) => ({ at: event.createdAt, ...(event.data as object) }))
    return JSON.stringify({ id: stored.id, sourceFilename: source ? (source.data as { originalFilename: string }).originalFilename : 'unknown', row, auditTrail: events })
  },
}

export const readIngestionGuideTool: ToolDefinition = {
  name: 'read_ingestion_guide',
  description: 'Returns the complete step-by-step guide to the data ingestion and labelling workflow: the two steps, the canonical fields a source must supply, every label dimension with the meaning of each of its values, the judgment rules, and which actions belong to the user alone. Call it BEFORE doing or explaining anything about importing, mapping columns, labelling rows, categories, or confirming rows — including when the user simply asks for help with any of that. Read-only.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => {
    const stored = (await assistantPromptsTable.toArray()).find((row) => (row.data as AssistantPrompt).key === INGESTION_GUIDE_KEY)
    return stored ? (stored.data as AssistantPrompt).content : DEFAULT_INGESTION_GUIDE
  },
}
