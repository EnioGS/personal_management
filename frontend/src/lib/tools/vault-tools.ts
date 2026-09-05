import { buildLabelCatalogue } from '@/lib/label-catalogue-source'
import { describeVault, queryVault } from '@/lib/sql/query-vault'
import { ingestionLabelErrors } from '@/lib/model/ingestion'
import { parsePlacementLabels, resolveScreenLabel, resolveSectionLabel, withDerivedSections } from '@/lib/model/label-catalogue'
import { confirmedRowsTable, sourceFilesTable, sourceRowsTable } from '@/lib/model/model-db'
import { newRowId } from '@/lib/model/row-id'
import {
  ASSIGNABLE_FIELDS,
  amountShapeOf,
  assignSourceColumns,
  confirmSourceRows,
  planConfirmation,
  setSignConvention,
} from '@/lib/model/source-files'
import type { ConfirmedRow, IngestionTargetField, SourceFile, SourceRow } from '@/lib/model/types'
import type { ToolDefinition } from './types'

export const queryVaultTool: ToolDefinition = {
  name: 'query_vault',
  description: "Runs one SELECT against the app's data and returns columns and rows. This is how you read anything: there is a table per uploaded file (source__<file>__<id>), a table per (section, screen) pair holding confirmed rows (confirmed__<section>__<screen>), and label_rules. Call it with no statement to get the schema — every table, its columns and how many rows it holds — which is the right first call on unfamiliar data. Count and group here rather than reading rows you do not need; at most 200 rows come back and the total is always reported. Reading is all this does: changes go through the other tools.",
  parameters: { type: 'object', properties: { statement: { type: 'string', description: 'One SELECT, or WITH … SELECT. Omit to describe the schema instead.' } }, additionalProperties: false },
  execute: async (args) => {
    if (typeof args.statement !== 'string' || !args.statement.trim()) {
      return JSON.stringify({ tables: await describeVault(), note: 'Pass a SELECT to read any of these.' })
    }
    try {
      return JSON.stringify(await queryVault(args.statement))
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'that query could not run.'}` }
  },
}

export const assignSourceColumnsTool: ToolDefinition = {
  name: 'assign_source_columns',
  description: `Says what a file's own columns mean: ${ASSIGNABLE_FIELDS.join(', ')}. Only the file's own columns can be assigned — never source_filename, never a label column — and one field takes one column, so assigning it again moves it. Everything left unassigned is not lost: it is condensed into the observations of each row when it is confirmed. Read the file first; assignment is step one of four, before sections, screens and the sign.`,
  parameters: {
    type: 'object',
    properties: {
      sourceId: { type: 'number' },
      assignments: { type: 'object', additionalProperties: { type: 'string' }, description: 'Column name -> canonical field. Pass an empty string to clear one.' },
    },
    required: ['sourceId', 'assignments'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number' || typeof args.assignments !== 'object' || args.assignments === null) return 'Error: sourceId and assignments are required.'
    try {
      const assignments = Object.fromEntries(
        Object.entries(args.assignments as Record<string, unknown>).map(([column, target]) => [column, target ? (String(target) as IngestionTargetField) : null]),
      )
      const file = await assignSourceColumns(args.sourceId, assignments)
      return JSON.stringify({ file: file.originalFilename, assignments: file.assignments, unassigned: file.originalColumns.filter((column) => !file.assignments[column]) })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not assign those columns.'}` }
  },
}

export const setSignConventionTool: ToolDefinition = {
  name: 'set_sign_convention',
  description: "Makes a file's amounts mean what this app means: negative left, positive arrived. Decide this only after the rows are labelled, because it depends on where they are going — and sample those tables first with query_vault to see what signs comparable rows already carry, whatever convention anyone has recorded. invertAll suits a file that consistently means the opposite, such as a card export writing purchases as positive. invertWhen suits a file whose amounts are all one sign and whose direction lives in another column: name that column and the values that mean money leaving. The value the file wrote is kept in each row's observations, so nothing is lost. If the evidence does not settle it, ask the user rather than guessing.",
  parameters: {
    type: 'object',
    properties: {
      sourceId: { type: 'number' },
      kind: { type: 'string', enum: ['asImported', 'invertAll', 'invertWhen'] },
      column: { type: 'string', description: 'For invertWhen: the column stating direction.' },
      values: { type: 'array', items: { type: 'string' }, description: 'For invertWhen: the values in that column meaning money left.' },
    },
    required: ['sourceId', 'kind'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number') return 'Error: sourceId is required.'
    try {
      const kind = args.kind as 'asImported' | 'invertAll' | 'invertWhen'
      if (kind === 'invertWhen' && (typeof args.column !== 'string' || !Array.isArray(args.values) || args.values.length === 0)) {
        return 'Error: invertWhen needs the column that states direction and the values in it that mean money left.'
      }
      const convention = kind === 'invertWhen'
        ? { kind, column: String(args.column), values: (args.values as unknown[]).map(String) }
        : { kind }
      const file = await setSignConvention(args.sourceId, convention)
      return JSON.stringify({ file: file.originalFilename, signConvention: file.signConvention, shape: await amountShapeOf(args.sourceId) })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not set that convention.'}` }
  },
}

async function labelSourceRows(rowIds: number[], values: Record<string, unknown>, translate: (key: string) => string) {
  const catalogue = buildLabelCatalogue(translate)
  const results: unknown[] = []
  for (const id of rowIds) {
    const stored = await sourceRowsTable.get(id)
    if (!stored) { results.push({ id, error: 'not found' }); continue }
    const row = stored.data as SourceRow
    const text = (field: string) => (typeof values[field] === 'string' ? (values[field] as string) : undefined)

    const sections = text('sections') === undefined ? undefined : parsePlacementLabels(text('sections')!, (value) => resolveSectionLabel(catalogue, value))
    const screens = text('screens') === undefined
      ? undefined
      : parsePlacementLabels(text('screens')!, (value) => resolveScreenLabel(catalogue, value, sections?.values ?? row.labels.sections))

    const labels = withDerivedSections({
      ...row.labels,
      ...(sections ? { sections: sections.values } : {}),
      ...(screens ? { screens: screens.values } : {}),
      ...(text('category') !== undefined ? { category: text('category') } : {}),
      ...(text('subcategory') !== undefined ? { subcategory: text('subcategory') } : {}),
    }, catalogue)

    await sourceRowsTable.update(id, { data: { ...row, labels } satisfies SourceRow })
    const unknown = [...(sections?.unknown ?? []), ...(screens?.unknown ?? [])]
    results.push({ id, labels, errors: [...ingestionLabelErrors(labels, catalogue), ...unknown.map((value) => `Nothing is called ${value}.`)] })
  }
  return results
}

export const setLabelsTool: ToolDefinition = {
  name: 'set_labels',
  description: "Sets labels on source rows by their id. Sections and screens take several values separated by commas and are checked against the app's own navigation — list_label_options says what exists, and a screen is only valid inside a section the row names. Category and subcategory are free text, one value each, and start at 'outros', which means nobody has said anything more precise. Fields you leave out keep what they hold.",
  parameters: {
    type: 'object',
    properties: {
      rowIds: { type: 'array', items: { type: 'number' } },
      sections: { type: 'string' },
      screens: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
    },
    required: ['rowIds'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : []
    if (rowIds.length === 0) return 'Error: rowIds are required.'
    return JSON.stringify(await labelSourceRows(rowIds, args, context.translate))
  },
}

export const labelRowsByMatchTool: ToolDefinition = {
  name: 'label_rows_by_match',
  description: "Labels every source row whose chosen field contains a piece of text, in one call. This is the one-off half of labelling: use it when a pattern is real but not worth keeping — save_label_rule is for one that will recur, and is what makes future imports land already labelled. It only fills rows that match; fields you leave out keep what they hold, and it reports how many rows it touched with a sample of what matched, so a match that was wider than you meant is visible immediately.",
  parameters: {
    type: 'object',
    properties: {
      sourceId: { type: 'number', description: 'Limit to one file. Omit to label across every file.' },
      field: { type: 'string', description: "A column of the file, or 'source_filename'." },
      contains: { type: 'string' },
      caseSensitive: { type: 'boolean' },
      sections: { type: 'string' },
      screens: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
    },
    required: ['field', 'contains'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.field !== 'string' || typeof args.contains !== 'string' || !args.contains.trim()) {
      return 'Error: field and contains are required.'
    }
    const needle = args.caseSensitive === true ? args.contains : args.contains.toLowerCase()
    const matched: { id: number; text: string }[] = []
    for (const stored of await sourceRowsTable.toArray()) {
      const row = stored.data as SourceRow
      if (typeof args.sourceId === 'number' && row.sourceId !== args.sourceId) continue
      const value = row.values[args.field]
      if (typeof value !== 'string') continue
      const haystack = args.caseSensitive === true ? value : value.toLowerCase()
      if (haystack.includes(needle)) matched.push({ id: stored.id, text: value })
    }
    if (matched.length === 0) return JSON.stringify({ matched: 0, note: `Nothing in ${args.field} contains "${args.contains}".` })

    const results = await labelSourceRows(matched.map((row) => row.id), args, context.translate)
    return JSON.stringify({ matched: matched.length, sample: matched.slice(0, 5).map((row) => row.text), rows: results.slice(0, 5) })
  },
}

export const markRowsTool: ToolDefinition = {
  name: 'mark_rows',
  description: "Marks rows for elimination, or unmarks them. A marked row disappears from every dashboard and stays in its table — the one thing this app hides, and what makes marking safe to use freely. It works on source rows and confirmed rows alike. You cannot delete anything: removing marked rows is the user's, and the only thing they can do that you cannot. To correct a confirmed row, add the corrected one with the same row_id and mark the old one here.",
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string', enum: ['source', 'confirmed'] },
      rowIds: { type: 'array', items: { type: 'number' } },
      marked: { type: 'boolean', description: 'true marks (default); false unmarks.' },
      reason: { type: 'string' },
    },
    required: ['table', 'rowIds'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : []
    if (rowIds.length === 0) return 'Error: rowIds are required.'
    const marked = args.marked !== false
    const table = args.table === 'confirmed' ? confirmedRowsTable : sourceRowsTable
    let changed = 0
    for (const id of rowIds) {
      const stored = await table.get(id)
      if (!stored) continue
      await table.update(id, { data: { ...(stored.data as object), markedForElimination: marked } })
      changed += 1
    }
    return JSON.stringify({ changed, marked, reason: args.reason ?? null })
  },
}

export const newRowIdTool: ToolDefinition = {
  name: 'new_row_id',
  description: "Mints an id for a row that came from nowhere — one you are adding rather than correcting. A correction keeps the id of the row it corrects, so use this only for genuinely new data, and pass the contents the row will hold so the id is derived from them.",
  parameters: { type: 'object', properties: { contents: { type: 'object', additionalProperties: true } }, additionalProperties: false },
  execute: async (args) => JSON.stringify({ rowId: newRowId((args.contents ?? {}) as Record<string, unknown>) }),
}

export const addConfirmedRowTool: ToolDefinition = {
  name: 'add_confirmed_row',
  description: "Adds a row directly to a confirmed table. Two uses, and no others: correcting a row — pass the row_id of the one you are replacing and mark that one for elimination — or recording something the files never carried. Never edit a row in place; the pair of an added row and a marked one is what keeps the history readable. Amounts are signed the way this app means: negative left, positive arrived.",
  parameters: {
    type: 'object',
    properties: {
      rowId: { type: 'string', description: 'The id of the row being corrected, or one from new_row_id.' },
      section: { type: 'string' },
      screen: { type: 'string' },
      date: { type: 'string', description: 'Any readable date; day-first is understood.' },
      amount: { type: 'number' },
      observations: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      sourceFilename: { type: 'string' },
    },
    required: ['rowId', 'section', 'screen'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const catalogue = buildLabelCatalogue(context.translate)
    const section = resolveSectionLabel(catalogue, String(args.section ?? ''))
    const screen = resolveScreenLabel(catalogue, String(args.screen ?? ''), section ? [section] : undefined)
    if (!section || !screen) return `Error: ${!section ? 'no section' : 'no screen'} is called that. Call list_label_options for what exists.`
    const { parseDateValue } = await import('@/lib/parse-date')
    const row: ConfirmedRow = {
      rowId: String(args.rowId),
      section,
      screen,
      sourceFilename: typeof args.sourceFilename === 'string' ? args.sourceFilename : 'added by the assistant',
      confirmedAt: Date.now(),
      date: parseDateValue(args.date) ?? undefined,
      amount: typeof args.amount === 'number' ? args.amount : undefined,
      observations: typeof args.observations === 'string' ? args.observations : '',
      category: typeof args.category === 'string' && args.category.trim() ? args.category.trim() : 'outros',
      subcategory: typeof args.subcategory === 'string' && args.subcategory.trim() ? args.subcategory.trim() : 'outros',
    }
    const id = await confirmedRowsTable.add({ createdAt: Date.now(), data: row })
    return JSON.stringify({ id, row })
  },
}

export const confirmRowsTool: ToolDefinition = {
  name: 'confirm_rows',
  description: "Moves a file's labelled rows into the tables their labels name — one copy per (section, screen) pair, all sharing the row's id — and takes them out of the file. Without discardMarked this is the non-destructive half: rows that are unlabelled or marked stay where they are, and you may run it freely, saying afterwards what moved. With discardMarked it also drops what is marked for elimination and retires the file, which is destructive: ask the user first.",
  parameters: {
    type: 'object',
    properties: {
      sourceId: { type: 'number' },
      discardMarked: { type: 'boolean' },
      confirmed: { type: 'boolean', description: 'Required with discardMarked, and only after the user has agreed.' },
    },
    required: ['sourceId'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.sourceId !== 'number') return 'Error: sourceId is required.'
    const catalogue = buildLabelCatalogue(context.translate)
    try {
      const plan = await planConfirmation(args.sourceId, catalogue)
      if (args.discardMarked === true && args.confirmed !== true) {
        return JSON.stringify({ confirmed: false, plan: { ready: plan.ready.length, incomplete: plan.incomplete.length, marked: plan.marked.length }, next: 'This also drops the marked rows and retires the file. Tell the user exactly what that moves, and call again with confirmed: true once they agree.' })
      }
      return JSON.stringify(await confirmSourceRows(args.sourceId, catalogue, { discardMarked: args.discardMarked === true }))
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not confirm those rows.'}` }
  },
}

export const dropSourceTableTool: ToolDefinition = {
  name: 'drop_source_table',
  description: 'Removes an uploaded file that has no rows left. A file still holding rows is refused, and a confirmed table can never be dropped: those are what the dashboards read.',
  parameters: { type: 'object', properties: { sourceId: { type: 'number' } }, required: ['sourceId'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number') return 'Error: sourceId is required.'
    const stored = await sourceFilesTable.get(args.sourceId)
    if (!stored) return `Error: source file ${args.sourceId} was not found.`
    const remaining = (await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === args.sourceId).length
    if (remaining > 0) return `Error: "${(stored.data as SourceFile).originalFilename}" still holds ${remaining} row(s). Confirm or mark them first.`
    await sourceFilesTable.delete(args.sourceId)
    return JSON.stringify({ dropped: (stored.data as SourceFile).originalFilename })
  },
}

export const listLabelOptionsTool: ToolDefinition = {
  name: 'list_label_options',
  description: "Lists what the placement labels may be set to right now: the app's sections and the screens inside each, with the id to store and the name currently shown. These follow the app, so read them here rather than remembering them, and never invent one. Category and subcategory are free text and need no list.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async (_args, context) => {
    const catalogue = buildLabelCatalogue(context.translate)
    return JSON.stringify({
      sections: catalogue.sections,
      screens: catalogue.screens,
      note: 'Store the id. A row may name several of each; a screen is only valid inside a section the row names.',
    })
  },
}
