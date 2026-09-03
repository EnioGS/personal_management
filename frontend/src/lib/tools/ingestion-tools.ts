import { DEFAULT_INGESTION_GUIDE, INGESTION_GUIDE_KEY } from '@/lib/ingestion-guide'
import { ingestionLabelErrors } from '@/lib/model/ingestion'
import { ensureCategoryByName } from '@/lib/model/category-vocabulary'
import { createSupplementalColumn, parseIngestionCsv, saveIngestionMappings } from '@/lib/model/ingestion-source'
import { discardIngestionRows, updateIngestionRowLabels, updateIngestionRowWorklist } from '@/lib/model/ingestion-promotion'
import { findDuplicateMatches, findDuplicateMatchesWithin, normalizeAmount, normalizeDate, normalizeText, type ComparableRow } from '@/lib/model/ingestion-duplicates'
import { FINANCE_DESTINATIONS, FLOW_ROLES, labelValues, matchLabelValue, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS } from '@/lib/model/label-vocabulary'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { categoriesTable, entriesTable, ingestionAuditEventsTable, ingestionColumnMappingsTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from '@/lib/model/model-db'
import type { AssistantPrompt } from '@/lib/assistant-prompts'
import type { Category, IngestionAuditEvent, IngestionColumnMapping, IngestionRow, IngestionRowLabels, IngestionSource, IngestionTargetField, TableDef } from '@/lib/model/types'
import type { ToolDefinition } from './types'

const MAX_ROWS = 100

/**
 * A source as the model should see it: everything that identifies it, and never its
 * `rawCsv`. The raw file is provenance measured in tens of kilobytes — spreading the
 * stored record would put an entire bank statement into the conversation.
 * Counts are computed from the rows themselves, so a stored `rowCount` that was never
 * updated (the legacy migration's synthetic source) can't tell the model there is
 * nothing to read.
 */
function summariseSource(stored: { id: number; data: unknown }, rows: IngestionRow[]) {
  const { rawCsv, rowCount: _statedByTheFile, ...source } = stored.data as IngestionSource
  const mine = rows.filter((row) => row.sourceId === stored.id)
  return {
    id: stored.id,
    ...source,
    rawCsvLength: rawCsv?.length ?? 0,
    // A legacy source has no file to map, and saying so here saves the model from
    // analysing columns that cannot exist. Its rows were moved out of the finance
    // tables, so they are already mapped — they only need labels.
    ...(source.legacy
      ? { note: 'Legacy migration: rows moved out of the finance tables. There is no original file and no column mapping to do — these rows only need labels.' }
      : {}),
    rows: {
      total: mine.length,
      unlabelled: mine.filter((row) => row.status === 'unlabelled').length,
      invalid: mine.filter((row) => row.status === 'invalid').length,
      ready: mine.filter((row) => row.status === 'ready').length,
      finalized: mine.filter((row) => row.status === 'promoted' || row.status === 'reconciledExisting').length,
    },
  }
}
const TARGET_FIELDS: IngestionTargetField[] = ['date', 'amount', 'description', 'rawCategory', 'direction', 'asset', 'investmentType', 'quantity', 'price', 'note', 'destination', 'financeDestination', 'flowRole', 'settlementChannel', 'spendingTreatment', 'categoryId', 'recurrence', 'destinationTableId']

/** Mapping tools act on an uploaded file; the migration's synthetic source has none. */
async function rejectIfLegacy(sourceId: number): Promise<string | null> {
  const stored = await ingestionSourcesTable.get(sourceId)
  if (!stored) return `Error: ingestion source ${sourceId} was not found.`
  if (!(stored.data as IngestionSource).legacy) return null
  return 'Error: this is the legacy migration source, not an uploaded file. It has no columns to map — its rows are already mapped and only need labels.'
}

export const listIngestionDatasetsTool: ToolDefinition = {
  name: 'list_ingestion_datasets',
  description: 'Lists the imported-unlabelled worklist and uploaded CSV sources with original filenames, source IDs, mapping state and per-status row counts, plus every destination table a row can be sent to with the id update_ingestion_labels expects. Start here. Read-only.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => {
    const [sources, storedRows, tables] = await Promise.all([ingestionSourcesTable.toArray(), ingestionRowsTable.toArray(), tableDefsTable.toArray()])
    const rows = storedRows.map((row) => row.data as IngestionRow)
    const active = rows.filter((row) => row.status !== 'promoted' && row.status !== 'reconciledExisting')
    return JSON.stringify({
      unlabelled: { count: active.length, ready: active.filter((row) => row.status === 'ready').length },
      confirmed: {
        count: rows.length - active.length,
        pendingReallocation: rows.filter((row) => row.hasPendingChange).length,
        note: 'Rows already in a Finance table. Relabelling one marks it for reallocation; the user alone confirms that, exactly as with promotion.',
      },
      readTheseWith: 'read_ingestion_table without a sourceId, one page at a time',
      sources: sources.map((source) => summariseSource(source, rows)),
      // A destination table is required on every row, and an empty table is still a
      // valid destination — so list them here rather than leaving the model to infer
      // them from a tool that reads rows.
      destinationTables: tables.map((table) => ({ destinationTableId: table.id, ...(table.data as TableDef) })),
    })
  },
}

/** The uploaded file itself, parsed. Null for the migration's source, which has none. */
function readSourceFile(stored: { data: unknown }) {
  const { rawCsv } = stored.data as IngestionSource
  if (!rawCsv) return null
  try {
    return parseIngestionCsv(rawCsv)
  } catch {
    return null
  }
}

export const readIngestionTableTool: ToolDefinition = {
  name: 'read_ingestion_table',
  description: 'Reads a paged slice of one of the three datasets: the imported-unlabelled worklist, the confirmed rows already in a Finance table, or one uploaded source file. For a source file it returns that file\'s own columns and rows exactly as uploaded (sourceColumns/sourceRows), which is what a column mapping must be judged from, plus any rows already staged from it. Read-only. The result reports the total, so read ONE page (25-100 rows), act on it, and answer the user — never loop through an entire backlog before replying.',
  parameters: { type: 'object', properties: { dataset: { type: 'string', enum: ['worklist', 'confirmed', 'discarded'], description: 'worklist (default) = rows waiting to be labelled; confirmed = rows already in a Finance table, which can still be relabelled for reallocation; discarded = rows set aside as duplicates or noise, readable and restorable but never promoted.' }, sourceId: { type: 'number', description: 'Uploaded source ID. Omit to read the chosen dataset across all sources.' }, offset: { type: 'number' }, limit: { type: 'number' } }, additionalProperties: false },
  execute: async (args) => {
    const offset = typeof args.offset === 'number' && args.offset >= 0 ? Math.floor(args.offset) : 0
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(MAX_ROWS, Math.floor(args.limit)) : 25
    const sourceId = typeof args.sourceId === 'number' ? args.sourceId : undefined
    const stored = await ingestionRowsTable.toArray()
    const rows = stored.map((row) => row.data as IngestionRow)
    const dataset = args.dataset === 'confirmed' || args.dataset === 'discarded' ? args.dataset : 'worklist'
    const isConfirmed = (row: IngestionRow) => row.status === 'promoted' || row.status === 'reconciledExisting'
    const selected = stored.map((row) => ({ id: row.id, ...(row.data as IngestionRow) })).filter((row) => {
      if (sourceId !== undefined && row.sourceId !== sourceId) return false
      if (dataset === 'confirmed') return isConfirmed(row)
      if (dataset === 'discarded') return row.status === 'discarded'
      // The worklist is what still needs work: neither finalized nor set aside.
      return !isConfirmed(row) && row.status !== 'discarded'
    })
    const source = sourceId === undefined ? undefined : await ingestionSourcesTable.get(sourceId)
    const mappings = sourceId === undefined ? [] : (await ingestionColumnMappingsTable.toArray()).filter((row) => (row.data as IngestionColumnMapping).sourceId === sourceId).map((row) => row.data)
    const page = selected.slice(offset, offset + limit)
    // A source file's own contents are not ingestion rows — those exist only once it
    // has been staged. Mapping happens before that, so the file's parsed columns and a
    // page of its values have to come back too, or the mapping would be guesswork.
    const file = source ? readSourceFile(source) : null
    return JSON.stringify({
      source: source ? summariseSource(source, rows) : sourceId === undefined ? 'Imported, unlabelled data' : null,
      ...(file ? { sourceColumns: file.columns, sourceRowCount: file.rows.length, sourceRows: file.rows.slice(offset, offset + limit) } : {}),
      total: selected.length,
      offset,
      returned: page.length,
      hasMore: offset + page.length < selected.length,
      rows: page,
      mappings,
    })
  },
}

export const assignIngestionColumnsTool: ToolDefinition = {
  name: 'assign_ingestion_columns',
  description: 'Assigns, changes, or clears canonical field mappings for an uploaded source. Inspect the source with read_ingestion_table first. This changes mapping metadata only; it does not stage or promote rows. Reject ambiguous assignments and report missing required fields.',
  parameters: { type: 'object', properties: { sourceId: { type: 'number' }, mappings: { type: 'array', items: { type: 'object', properties: { sourceColumn: { type: 'string' }, targetField: { type: 'string', enum: TARGET_FIELDS } }, required: ['sourceColumn', 'targetField'] } } }, required: ['sourceId', 'mappings'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number' || !Array.isArray(args.mappings)) return 'Error: sourceId and mappings are required.'
    const rejection = await rejectIfLegacy(args.sourceId)
    if (rejection) return rejection
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
    const rejection = await rejectIfLegacy(args.sourceId)
    if (rejection) return rejection
    try { return JSON.stringify(await createSupplementalColumn(args.sourceId, args.name)) } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not add blank column.'}` }
  },
}

export const updateIngestionLabelsTool: ToolDefinition = {
  name: 'update_ingestion_labels',
  description: `Sets or clears labels and the destination table for explicit imported rows. Read the rows first with read_ingestion_table, and read_ingestion_guide if you have not already, since every value below is closed except the category. financeDestination: ${labelValues(FINANCE_DESTINATIONS).join(' | ')}. flowRole: ${labelValues(FLOW_ROLES).join(' | ')}. settlementChannel: ${labelValues(SETTLEMENT_CHANNELS).join(' | ')}. spendingTreatment: ${labelValues(SPENDING_TREATMENTS).join(' | ')}. recurrence: ${labelValues(RECURRENCES).join(' | ')}. category is free text and a new name creates that category. It also relabels a row that is already confirmed: the change is held as a pending reallocation and the live entry keeps its current meaning until the user confirms it. Reports each row's readiness; this tool can never confirm, promote or reallocate — only the user can.`,
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

const LABEL_PROPERTIES = {
  financeDestination: { type: 'string', enum: labelValues(FINANCE_DESTINATIONS) },
  flowRole: { type: 'string', enum: labelValues(FLOW_ROLES) },
  settlementChannel: { type: 'string', enum: labelValues(SETTLEMENT_CHANNELS) },
  spendingTreatment: { type: 'string', enum: labelValues(SPENDING_TREATMENTS) },
  recurrence: { type: 'string', enum: labelValues(RECURRENCES) },
  category: { type: 'string', description: 'Category name. A name that does not exist yet is created.' },
  destinationTableId: { type: 'number', description: 'Row id of the destination table, from list_ingestion_datasets.' },
} as const

/** The text a rule is matched against: everything the source said about the row. */
function searchableText(row: IngestionRow, field: string): string {
  if (field === 'description') return String(row.mappedValues.description ?? row.rawValues.description ?? '')
  if (field === 'rawCategory') return String(row.mappedValues.rawCategory ?? row.rawValues.category ?? '')
  return [...Object.values(row.rawValues), row.mappedValues.description, row.mappedValues.rawCategory, row.mappedValues.note].map((value) => String(value ?? '')).join(' \u0000 ')
}

export const labelIngestionRowsByMatchTool: ToolDefinition = {
  name: 'label_ingestion_rows_by_match',
  description: `Applies one set of labels to every unfinalized row whose text matches a string — the efficient way to act on a rule such as "every row mentioning IOF" without reading each row. ALWAYS call it once with apply=false first: that changes nothing and returns the match count with examples, so the user can confirm the rule really describes those rows before hundreds are labelled. Report the count and the examples, and say plainly when the matches look mixed (a description containing IOF may be a charge on one row and a reversal on another). Only then call it again with apply=true. Values are the same closed vocabulary as update_ingestion_labels; fields you omit keep whatever each row already has. Finalized rows are never touched, and this cannot promote anything.`,
  parameters: {
    type: 'object',
    properties: {
      contains: { type: 'string', description: 'Text to look for, case-insensitive unless caseSensitive is true.' },
      field: { type: 'string', enum: ['any', 'description', 'rawCategory'], description: 'Where to look. "any" (default) searches every raw source value.' },
      caseSensitive: { type: 'boolean' },
      sourceId: { type: 'number', description: 'Restrict to one dataset.' },
      apply: { type: 'boolean', description: 'false (default) previews the match without changing anything; true applies the labels.' },
      includeConfirmed: { type: 'boolean', description: 'false (default) matches only rows waiting to be labelled; true also relabels rows already in a Finance table, marking them for the user to reallocate.' },
      labels: { type: 'object', properties: LABEL_PROPERTIES, additionalProperties: false },
    },
    required: ['contains', 'labels'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const contains = typeof args.contains === 'string' ? args.contains.trim() : ''
    if (!contains) return 'Error: contains is required and cannot be empty.'
    const update = (args.labels ?? {}) as Record<string, unknown>
    const field = typeof args.field === 'string' ? args.field : 'any'
    const caseSensitive = args.caseSensitive === true
    const needle = caseSensitive ? contains : contains.toLowerCase()

    const stored = await ingestionRowsTable.toArray()
    const matches = stored.filter((row) => {
      const data = row.data as IngestionRow
      const confirmed = data.status === 'promoted' || data.status === 'reconciledExisting'
      if (confirmed && args.includeConfirmed !== true) return false
      if (typeof args.sourceId === 'number' && data.sourceId !== args.sourceId) return false
      const text = searchableText(data, field)
      return (caseSensitive ? text : text.toLowerCase()).includes(needle)
    })

    const examples = matches.slice(0, 5).map((row) => ({ rowId: row.id, text: searchableText(row.data as IngestionRow, 'description').slice(0, 160), amount: (row.data as IngestionRow).mappedValues.amount, status: (row.data as IngestionRow).status }))
    if (args.apply !== true) {
      return JSON.stringify({ applied: false, matched: matches.length, examples, next: 'Show the user the count and these examples, confirm the rule really covers them, then call again with apply=true.' })
    }

    const categoryId = typeof update.category === 'string' ? await ensureCategoryByName(update.category) : undefined
    const result = { applied: true, matched: matches.length, ready: 0, invalid: 0, pendingReallocation: 0, unchanged: 0, errors: [] as string[] }
    for (const row of matches) {
      const current = row.data as IngestionRow
      const labels: IngestionRowLabels = {
        ...current.labels,
        ...(typeof update.financeDestination === 'string' ? { financeDestination: matchLabelValue(FINANCE_DESTINATIONS, update.financeDestination) } : {}),
        ...(typeof update.flowRole === 'string' ? { flowRole: matchLabelValue(FLOW_ROLES, update.flowRole) } : {}),
        ...(typeof update.settlementChannel === 'string' ? { settlementChannel: matchLabelValue(SETTLEMENT_CHANNELS, update.settlementChannel) } : {}),
        ...(typeof update.spendingTreatment === 'string' ? { spendingTreatment: matchLabelValue(SPENDING_TREATMENTS, update.spendingTreatment) } : {}),
        ...(typeof update.recurrence === 'string' ? { recurrence: matchLabelValue(RECURRENCES, update.recurrence) } : {}),
        ...(categoryId ? { categoryId } : {}),
      }
      const destinationTableId = typeof update.destinationTableId === 'number' ? update.destinationTableId : current.destinationTableId
      try {
        const next = await updateIngestionRowLabels(row.id, labels, destinationTableId, 'assistant')
        if (next.hasPendingChange) result.pendingReallocation += 1
        else if (next.status === 'ready') result.ready += 1
        else if (next.status === 'invalid') result.invalid += 1
        else result.unchanged += 1
      } catch (error) {
        result.errors.push(`Row ${row.id}: ${error instanceof Error ? error.message : 'could not be labelled.'}`)
      }
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

/** Every row and entry a candidate could already be a copy of. */
async function duplicateCorpus(excludeRowIds: Set<number>): Promise<ComparableRow[]> {
  const [storedRows, entries, tables] = await Promise.all([ingestionRowsTable.toArray(), entriesTable.toArray(), tableDefsTable.toArray()])
  const tableName = new Map(tables.map((table) => [table.id, (table.data as TableDef).name]))
  const linkedEntryIds = new Set(storedRows.flatMap((row) => {
    const data = row.data as IngestionRow
    return [data.promotedEntryId, data.existingEntryId].filter((id): id is number => typeof id === 'number')
  }))

  const corpus: ComparableRow[] = []
  for (const stored of storedRows) {
    if (excludeRowIds.has(stored.id)) continue
    const row = stored.data as IngestionRow
    corpus.push({
      key: `row:${stored.id}`,
      date: normalizeDate(row.mappedValues.date ?? row.rawValues.date),
      amount: normalizeAmount(row.mappedValues.amount ?? row.rawValues.amount),
      description: normalizeText(row.mappedValues.description ?? row.rawValues.description ?? ''),
      fingerprint: row.sourceRowFingerprint,
      context: { rowId: stored.id, status: row.status, destinationTable: tableName.get(row.destinationTableId ?? -1) },
    })
  }
  // An entry written by hand has no ingestion row behind it, and is still something a
  // new file can duplicate.
  for (const stored of entries) {
    if (linkedEntryIds.has(stored.id)) continue
    const entry = stored.data as Record<string, unknown>
    corpus.push({
      key: `entry:${stored.id}`,
      date: normalizeDate(entry.date),
      amount: normalizeAmount(entry.amount),
      description: normalizeText(entry.description ?? entry.note ?? ''),
      fingerprint: typeof entry.importKey === 'string' ? entry.importKey : undefined,
      context: { entryId: stored.id, status: 'inFinanceTable', destinationTable: tableName.get(Number(entry.tableId)) },
    })
  }
  return corpus
}

export const findIngestionDuplicatesTool: ToolDefinition = {
  name: 'find_ingestion_duplicates',
  description: 'Checks rows against everything already stored — the unlabelled worklist, the confirmed rows, and entries written by hand — and returns the ones that look like copies. ALWAYS run this on new data: on an uploaded source before its mapping is finished, and again on staged rows before labelling them, because the same transaction arrives twice from a bank as easily as from two overlapping files. It reports matches against stored data and, separately, rows the batch repeats within itself. It compares only the fields both rows actually have, so a file missing a column is still checked on the columns it does have: a match on date+amount+description is high confidence, an identical fingerprint is proof, and two fields agreeing with the third missing is medium — real, but worth a human eye. Read-only; discard_ingestion_rows is what acts on the answer.',
  parameters: {
    type: 'object',
    properties: {
      sourceId: { type: 'number', description: 'Check an uploaded file\'s own rows, before or after staging.' },
      rowIds: { type: 'array', items: { type: 'number' }, description: 'Check these staged rows instead.' },
      offset: { type: 'number' },
      limit: { type: 'number' },
    },
    additionalProperties: false,
  },
  execute: async (args) => {
    const offset = typeof args.offset === 'number' && args.offset >= 0 ? Math.floor(args.offset) : 0
    const limit = typeof args.limit === 'number' && args.limit > 0 ? Math.min(MAX_ROWS, Math.floor(args.limit)) : 50
    const sourceId = typeof args.sourceId === 'number' ? args.sourceId : undefined
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : undefined
    if (sourceId === undefined && !rowIds?.length) return 'Error: pass either sourceId or rowIds.'

    const storedRows = await ingestionRowsTable.toArray()
    const candidates: ComparableRow[] = []
    const excluded = new Set<number>()

    if (rowIds?.length) {
      for (const rowId of rowIds) {
        const stored = storedRows.find((row) => row.id === rowId)
        if (!stored) continue
        const row = stored.data as IngestionRow
        excluded.add(rowId)
        candidates.push({
          key: `row:${rowId}`,
          date: normalizeDate(row.mappedValues.date ?? row.rawValues.date),
          amount: normalizeAmount(row.mappedValues.amount ?? row.rawValues.amount),
          description: normalizeText(row.mappedValues.description ?? row.rawValues.description ?? ''),
          fingerprint: row.sourceRowFingerprint,
        })
      }
    } else {
      const source = await ingestionSourcesTable.get(sourceId!)
      if (!source) return `Error: ingestion source ${sourceId} was not found.`
      const staged = storedRows.filter((row) => (row.data as IngestionRow).sourceId === sourceId)
      for (const stored of staged) excluded.add(stored.id)
      const file = readSourceFile(source)
      if (file) {
        // Before staging there are no row ids, so a file row is named by its position.
        const columnFor = (names: string[]) => file.columns.find((column) => names.some((name) => normalizeText(column).includes(name)))
        const dateColumn = columnFor(['date', 'data'])
        const amountColumn = columnFor(['amount', 'valor', 'value'])
        const descriptionColumn = columnFor(['description', 'descricao', 'historico', 'estabelecimento', 'title'])
        file.rows.slice(offset, offset + limit).forEach((row, index) => {
          candidates.push({
            key: `file-row:${offset + index}`,
            date: normalizeDate(dateColumn ? row[dateColumn] : undefined),
            amount: normalizeAmount(amountColumn ? row[amountColumn] : undefined),
            description: normalizeText(descriptionColumn ? row[descriptionColumn] : ''),
          })
        })
      } else {
        for (const stored of staged.slice(offset, offset + limit)) {
          const row = stored.data as IngestionRow
          candidates.push({
            key: `row:${stored.id}`,
            date: normalizeDate(row.mappedValues.date ?? row.rawValues.date),
            amount: normalizeAmount(row.mappedValues.amount ?? row.rawValues.amount),
            description: normalizeText(row.mappedValues.description ?? row.rawValues.description ?? ''),
            fingerprint: row.sourceRowFingerprint,
          })
        }
      }
    }

    const matches = findDuplicateMatches(candidates, await duplicateCorpus(excluded))
    const withinTheSameBatch = findDuplicateMatchesWithin(candidates)
    return JSON.stringify({
      checked: candidates.length,
      offset,
      candidatesWithMatches: new Set(matches.map((match) => match.candidateKey)).size,
      matches,
      withinTheSameBatch,
      note: 'Medium confidence means two fields agreed and a third was missing on one side — judge it, do not assume it. withinTheSameBatch is the file repeating itself, where a real repeated charge looks identical to a duplicate: never discard one of those without asking. Nothing was changed.',
    })
  },
}

export const discardIngestionRowsTool: ToolDefinition = {
  name: 'discard_ingestion_rows',
  description: 'Sets staged rows aside as duplicates or noise, with a reason. A discarded row keeps every raw value and stays readable, but leaves the worklist and can never be promoted, so nothing is lost. Use it on what find_ingestion_duplicates reports, name the row it duplicates in the reason, and tell the user what you discarded and why. Pass restore=true to put rows back. A row already in a Finance table is refused: relabel and let the user reallocate it instead.',
  parameters: {
    type: 'object',
    properties: {
      rowIds: { type: 'array', items: { type: 'number' } },
      reason: { type: 'string', description: 'Why — e.g. "duplicate of row 412 (same date, amount and description)".' },
      restore: { type: 'boolean' },
    },
    required: ['rowIds', 'reason'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : []
    if (rowIds.length === 0) return 'Error: rowIds are required.'
    if (typeof args.reason !== 'string' || !args.reason.trim()) return 'Error: a reason is required.'
    return JSON.stringify(await discardIngestionRows(rowIds, args.reason.trim(), 'assistant', args.restore === true))
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
    return JSON.stringify({ id: stored.id, sourceFilename: source ? (source.data as { originalFilename: string }).originalFilename : (row.sourceFilename ?? 'unknown'), row, auditTrail: events })
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
