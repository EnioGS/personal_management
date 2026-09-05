import { loadLabelCatalogue } from '@/lib/label-catalogue-source'
import { describeVault, queryVault } from '@/lib/sql/query-vault'
import { fillFromObservations, placeConfirmedRow, reviseConfirmedRows, setConfirmedMeaning, type ConfirmedRevision } from '@/lib/model/confirmed-rows'
import { SOURCE_FILENAME_KEY, withObservation } from '@/lib/model/observations'
import { DEFAULT_MEANING, ingestionLabelErrors } from '@/lib/model/ingestion'
import { parsePlacementLabels, placementsOf, resolveAccountLabel, resolveCardLabel, resolveScreenLabel, resolveSectionLabel, withDerivedSections, type LabelCatalogue } from '@/lib/model/label-catalogue'
import { confirmedRowsTable, sourceFilesTable, sourceRowsTable } from '@/lib/model/model-db'
import { newRowId } from '@/lib/model/row-id'
import { applyLabelRulesToRows } from '@/lib/model/label-rules-repository'
import {
  ASSIGNABLE_FIELDS,
  addSourceRow,
  amountShapeOf,
  assignSourceColumns,
  confirmSourceRows,
  createSourceFile,
  missingAssignments,
  planConfirmation,
  setSignConvention,
  updateSourceValue,
} from '@/lib/model/source-files'
import type { ConfirmedRow, IngestionTargetField, SourceFile, SourceRow } from '@/lib/model/types'
import type { ToolDefinition } from './types'

export const queryVaultTool: ToolDefinition = {
  name: 'query_vault',
  description: "Runs one SELECT against the app's data and returns columns and rows. This is how you read anything: there is a table per uploaded file (source__<file>__<id>), a table per (section, screen) pair holding confirmed rows (confirmed__<section>__<screen>), and label_rules. Call it with no statement to get the schema — every table, its columns, how many rows it holds, and for a confirmed table how its values are signed today, which is the reference any sign decision is measured against. That is the right first call on unfamiliar data. Count and group here rather than reading rows you do not need; at most 200 rows come back and the total is always reported. Reading is all this does: changes go through the other tools.",
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

export const importAsSourceFileTool: ToolDefinition = {
  name: 'import_as_source_file',
  description: "Turns text into a new source file, exactly as if it had been dropped on the ingestion centre — it appears in the file list and is worked on the same way. Use it for data that arrives as text rather than as a CSV upload: a .txt or .md the user attached, a table pasted into the message, a statement copied out of a PDF. Pass the text with a header row. Commas, semicolons, tabs, pipes and spaced dashes are all detected, and a markdown pipe table is read as a table — but detection picks whatever splits the file most consistently, so pass `delimiter` when the file separates with something its own values also contain. Check the columns in the result: one column whose name holds every heading means the wrong separator, and the fix is to say which it is rather than to work around the shape. Give it a filename that says where the data came from, since that filename is stamped on every row and is what duplicate checking compares. Nothing is confirmed by this: the rows arrive unlabelled, standing source rules run over them, and the ordinary flow follows.",
  parameters: {
    type: 'object',
    properties: {
      filename: { type: 'string', description: 'What to call it, e.g. "nubank-2026-09.csv". A name that says where it came from.' },
      content: { type: 'string', description: 'The text itself: a header row and the rows under it.' },
      delimiter: { type: 'string', description: 'What separates the columns, when detection would get it wrong — e.g. " - " for "Date - Type - Asset".' },
    },
    required: ['filename', 'content'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.filename !== 'string' || !args.filename.trim()) return 'Error: a filename is required — every row is stamped with it.'
    if (typeof args.content !== 'string' || !args.content.trim()) return 'Error: content is required.'
    try {
      const delimiter = typeof args.delimiter === 'string' && args.delimiter ? args.delimiter : undefined
      const sourceId = await createSourceFile(args.filename.trim(), args.content, { delimiter })
      const file = await sourceFileById(sourceId)
      const applied = await applyLabelRulesToRows('source', context.translate)
      const rows = (await sourceRowsTable.toArray()).filter((row) => (row.data as SourceRow).sourceId === sourceId).length
      return JSON.stringify({
        sourceId,
        filename: file?.originalFilename,
        columns: file?.originalColumns,
        rows,
        // Said back so a wrong separator is caught here rather than three steps later.
        note: (file?.originalColumns.length ?? 0) === 1
          ? 'Only one column was found. If the text really has more, pass delimiter — the file separates with something detection did not try, or with something its own values contain.'
          : undefined,
        labelledByRules: applied.rowsTouched,
        looksLikeSourceId: file?.looksLikeSourceId ?? null,
      })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'that text could not be read as a table.'}` }
  },
}

async function sourceFileById(sourceId: number): Promise<SourceFile | undefined> {
  const stored = await sourceFilesTable.get(sourceId)
  return stored?.data as SourceFile | undefined
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
  description: "Makes a file's values mean what this app means: negative left, positive arrived. It acts on the column assigned to value — the money that moved — and not on amount, which is units of a thing and has no direction. Decide this only after the rows are labelled, because it depends on where they are going, and sample those tables first with query_vault to see what signs comparable rows already carry, whatever convention anyone has recorded. invertAll suits a file that consistently means the opposite, such as a card export writing purchases as positive. invertWhen suits a file whose values are all one sign and whose direction lives in another column: name that column and the entries in it that mean money leaving. What the file wrote is kept in each row's observations, so nothing is lost. If the evidence does not settle it, ask the user rather than guessing.",
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
  const catalogue = await loadLabelCatalogue(translate)
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

    // An account or a card has to name one the user set up; anything else is refused
    // rather than stored, the same way a screen nobody has is refused.
    const account = text('account') === undefined ? undefined : resolveAccountLabel(catalogue, text('account')!)
    const card = text('card') === undefined ? undefined : resolveCardLabel(catalogue, text('card')!)
    const unnamed = [
      ...(text('account') && !account ? [text('account')!] : []),
      ...(text('card') && !card ? [text('card')!] : []),
    ]

    const labels = withDerivedSections({
      ...row.labels,
      ...(sections ? { sections: sections.values } : {}),
      ...(screens ? { screens: screens.values } : {}),
      ...(text('category') !== undefined ? { category: text('category') } : {}),
      ...(text('subcategory') !== undefined ? { subcategory: text('subcategory') } : {}),
      ...(text('account') !== undefined ? { account } : {}),
      ...(text('card') !== undefined ? { card } : {}),
    }, catalogue)

    await sourceRowsTable.update(id, { data: { ...row, labels } satisfies SourceRow })
    const unknown = [...(sections?.unknown ?? []), ...(screens?.unknown ?? []), ...unnamed]
    results.push({ id, labels, errors: [...ingestionLabelErrors(labels, catalogue), ...unknown.map((value) => `Nothing is called ${value}.`)] })
  }
  return results
}

export const setLabelsTool: ToolDefinition = {
  name: 'set_labels',
  description: "Sets labels on source rows by their id. Sections and screens take several values separated by commas and are checked against the app's own navigation — list_label_options says what exists, and a screen is only valid inside a section the row names. Category and subcategory are free text, one value each, and start at 'outros', which means nobody has said anything more precise. Account and card are optional and must name one the user set up in Settings, by its name; they are how a row says which account it moved through or which card it was billed to, and list_label_options names the ones that exist. Fields you leave out keep what they hold.",
  parameters: {
    type: 'object',
    properties: {
      rowIds: { type: 'array', items: { type: 'number' } },
      sections: { type: 'string' },
      screens: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      account: { type: 'string', description: "One of the user's accounts, by name. Required before a row can be confirmed; add_account registers one that does not exist yet." },
      card: { type: 'string', description: "One of the user's credit cards, by name. Optional — leave it out for a row no card was involved in. add_card registers one, against an account." },
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
      account: { type: 'string' },
      card: { type: 'string' },
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

export const addSourceRowTool: ToolDefinition = {
  name: 'add_source_row',
  description: "Adds a row to a file's own table — for a transaction the file left out, or one the user knows about and wants recorded before it appears anywhere. Pass values keyed by the file's own column names; anything you leave out starts empty. The row is unlabelled and gets an id of its own, so it goes through exactly what every other row goes through before it can be confirmed. The user has the same button on the table.",
  parameters: {
    type: 'object',
    properties: {
      sourceId: { type: 'number' },
      values: { type: 'object', additionalProperties: { type: 'string' }, description: "Column name -> value, using the file's own column names." },
    },
    required: ['sourceId'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.sourceId !== 'number') return 'Error: sourceId is required.'
    try {
      const id = await addSourceRow(args.sourceId)
      const values = (args.values ?? {}) as Record<string, unknown>
      for (const [column, value] of Object.entries(values)) await updateSourceValue(id, column, String(value ?? ''))
      const stored = await sourceRowsTable.get(id)
      return JSON.stringify({ rowId: id, row: stored?.data })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'that row could not be added.'}` }
  },
}

export const setSourceValuesTool: ToolDefinition = {
  name: 'set_source_values',
  description: "Corrects a source row's own values, by the file's column names. Use it where the file itself is wrong or unreadable — a date the export mangled, a value split across columns — and not to express meaning: what a row *is* belongs in its labels, and a raw value rewritten to say something is a value nobody can check against the file any more. Editing the value edits what the file said, and the file's sign convention is then re-applied to it. The user edits the same cells by double-clicking them.",
  parameters: {
    type: 'object',
    properties: {
      rowId: { type: 'number' },
      values: { type: 'object', additionalProperties: { type: 'string' } },
    },
    required: ['rowId', 'values'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (typeof args.rowId !== 'number' || typeof args.values !== 'object' || args.values === null) return 'Error: rowId and values are required.'
    try {
      for (const [column, value] of Object.entries(args.values as Record<string, unknown>)) {
        await updateSourceValue(args.rowId, column, String(value ?? ''))
      }
      const stored = await sourceRowsTable.get(args.rowId)
      return JSON.stringify({ rowId: args.rowId, row: stored?.data })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'those values could not be written.'}` }
  },
}

export const setConfirmedMeaningTool: ToolDefinition = {
  name: 'set_confirmed_meaning',
  description: "Sets the category and subcategory of rows already in a confirmed table. These are the two labels a row may be given later — a row can be confirmed knowing only where it belongs — so this is an ordinary edit and not a correction: nothing about what the row moved, when, or where it belongs changes. Anything else about a confirmed row is corrected the other way, by adding the corrected row with the same row_id and marking the old one. The user edits these same two cells in the table, so this leaves you no more able than they are.",
  parameters: {
    type: 'object',
    properties: {
      rowIds: { type: 'array', items: { type: 'number' } },
      category: { type: 'string' },
      subcategory: { type: 'string' },
    },
    required: ['rowIds'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : []
    if (rowIds.length === 0) return 'Error: rowIds are required.'
    const meaning = {
      ...(typeof args.category === 'string' ? { category: args.category.trim() || DEFAULT_MEANING } : {}),
      ...(typeof args.subcategory === 'string' ? { subcategory: args.subcategory.trim() || DEFAULT_MEANING } : {}),
    }
    if (Object.keys(meaning).length === 0) return 'Error: pass a category, a subcategory, or both.'
    let changed = 0
    for (const id of rowIds) {
      try { await setConfirmedMeaning(id, meaning); changed += 1 } catch { continue }
    }
    return JSON.stringify({ changed, meaning })
  },
}

export const fillFromObservationsTool: ToolDefinition = {
  name: 'fill_from_observations',
  description: "Fills in a confirmed row's date or value from the observations, where the file's own columns were kept. Use it for rows confirmed before their file was told which column held the date and which held the money: they are in their table with both empty, invisible to every dashboard, while the values sit in the observations under the file's column names — read one row's observations first to see what those names are. Only empty fields are touched, so it can be run twice safely, and nothing else about the row changes: this extracts a value that was always there rather than correcting one that was wrong.",
  parameters: {
    type: 'object',
    properties: {
      section: { type: 'string', description: 'Limit to one table. Omit to sweep every confirmed row.' },
      screen: { type: 'string' },
      dateKey: { type: 'string', description: "The observations key holding the date, e.g. \"Data\"." },
      valueKey: { type: 'string', description: "The observations key holding the money, e.g. \"Valor\"." },
    },
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const dateKey = typeof args.dateKey === 'string' ? args.dateKey : undefined
    const valueKey = typeof args.valueKey === 'string' ? args.valueKey : undefined
    if (!dateKey && !valueKey) return 'Error: name at least one observations key — dateKey, valueKey, or both.'

    const catalogue = await loadLabelCatalogue(context.translate)
    const section = typeof args.section === 'string' ? resolveSectionLabel(catalogue, args.section) : undefined
    const screen = typeof args.screen === 'string' ? resolveScreenLabel(catalogue, args.screen, section ? [section] : undefined) : undefined
    if (typeof args.section === 'string' && !section) return 'Error: no section is called that.'
    if (typeof args.screen === 'string' && !screen) return 'Error: no screen is called that.'

    return JSON.stringify(await fillFromObservations({ section, screen }, { date: dateKey, value: valueKey }))
  },
}

export const reviseConfirmedRowsTool: ToolDefinition = {
  name: 'revise_confirmed_rows',
  description: "Corrects many confirmed rows at once, keeping the discipline that makes a correction readable: for every row it touches it adds the corrected row with the same row_id and marks the old one for elimination. Nothing is overwritten and nothing is deleted — a row already on a dashboard is evidence of what the user was told, and both versions stay, the old one invisible to every dashboard and still in its table. Pick the rows with selectIds, which is a SELECT returning an id column, or list them; name only the fields that change. Account and card must name something the user set up. Where a row belongs is not changed here — place_confirmed_rows moves a row between tables. A row that is already marked is skipped rather than superseded twice.",
  parameters: {
    type: 'object',
    properties: {
      rowIds: { type: 'array', items: { type: 'number' } },
      selectIds: { type: 'string', description: 'One SELECT returning an id column, e.g. SELECT id FROM "confirmed__finances__spending" WHERE account = \'Conta principal\'.' },
      account: { type: 'string' },
      card: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      value: { type: 'number', description: 'Money that moved, signed.' },
      reason: { type: 'string', description: 'Why, for the user. Not stored on the row.' },
    },
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const listed = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : []
    let rowIds = listed
    if (typeof args.selectIds === 'string' && args.selectIds.trim()) {
      try { rowIds = [...listed, ...await idsFrom(args.selectIds)] }
      catch (error) { return `Error: ${error instanceof Error ? error.message : 'that query could not run.'}` }
    }
    if (rowIds.length === 0) return 'Error: pass rowIds, or a selectIds query that returns some.'

    const catalogue = await loadLabelCatalogue(context.translate)
    const revision: ConfirmedRevision = {}
    if (typeof args.account === 'string') {
      const account = resolveAccountLabel(catalogue, args.account)
      if (!account) return `Error: no account is called "${args.account}". Call list_accounts_and_cards, or add_account first.`
      revision.account = account
    }
    if (typeof args.card === 'string') {
      const card = resolveCardLabel(catalogue, args.card)
      if (!card) return `Error: no card is called "${args.card}". Call list_accounts_and_cards, or add_card first.`
      revision.card = card
    }
    if (typeof args.category === 'string') revision.category = args.category.trim() || DEFAULT_MEANING
    if (typeof args.subcategory === 'string') revision.subcategory = args.subcategory.trim() || DEFAULT_MEANING
    if (typeof args.value === 'number') revision.value = args.value

    try {
      return JSON.stringify({ ...await reviseConfirmedRows(rowIds, revision), changed: revision, reason: args.reason ?? null })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'those rows could not be revised.'}` }
  },
}

export const placeConfirmedRowsTool: ToolDefinition = {
  name: 'place_confirmed_rows',
  description: "Changes which table confirmed rows are in, or puts a copy of them in another one. Which table a row is in *is* its section and screen — there is no separate address — so this is how a placement is corrected, and how a row that turns out to belong on two screens gets its second copy. The row id is kept either way: it is what ties copies of one transaction together and what stops anything counting it twice. Use mode 'move' for a placement that was wrong and 'copy' for one that was incomplete. The user edits the same two cells in the confirmed table.",
  parameters: {
    type: 'object',
    properties: {
      rowIds: { type: 'array', items: { type: 'number' }, description: 'The stored ids of the copies to place, not their row_id.' },
      section: { type: 'string' },
      screen: { type: 'string' },
      mode: { type: 'string', enum: ['move', 'copy'] },
    },
    required: ['rowIds', 'section', 'screen'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : []
    if (rowIds.length === 0) return 'Error: rowIds are required.'

    const catalogue = await loadLabelCatalogue(context.translate)
    const section = resolveSectionLabel(catalogue, String(args.section ?? ''))
    const screen = resolveScreenLabel(catalogue, String(args.screen ?? ''), section ? [section] : undefined)
    if (!section || !screen) return `Error: ${!section ? 'no section' : 'no screen'} is called that. Call list_label_options for what exists.`

    const mode = args.mode === 'copy' ? 'copy' : 'move'
    let placed = 0
    for (const id of rowIds) {
      try { await placeConfirmedRow(id, { section, screen }, mode); placed += 1 } catch { continue }
    }
    return JSON.stringify({ placed, mode, section, screen })
  },
}

/**
 * The ids a SELECT picks out.
 *
 * Reading is capped at a screenful, because a read is something to look at; choosing what
 * to mark is not, and a rule like "everything with no date" is worth nothing if it stops
 * at two hundred rows. The statement is validated the same way every other read is — it
 * still cannot write — and only the ids it returns are used.
 */
async function idsFrom(statement: string): Promise<number[]> {
  const result = await queryVault(statement, { limit: Number.MAX_SAFE_INTEGER })
  const column = result.columns.findIndex((name) => name === 'id')
  if (column === -1) throw new Error('that query has to return an id column.')
  return result.rows.map((row) => Number(row[column])).filter((id) => Number.isInteger(id))
}

export const markRowsTool: ToolDefinition = {
  name: 'mark_rows',
  description: "Marks rows for elimination, or unmarks them, either by id or by a query that picks them out. A marked row disappears from every dashboard and stays in its table — the one thing this app hides, and what makes marking safe to use freely. It works on source rows and confirmed rows alike. You cannot delete anything: removing marked rows is the user's, and the only thing they can do that you cannot. To correct a confirmed row, add the corrected one with the same row_id and mark the old one here.",
  parameters: {
    type: 'object',
    properties: {
      table: { type: 'string', enum: ['source', 'confirmed'] },
      rowIds: { type: 'array', items: { type: 'number' } },
      selectIds: {
        type: 'string',
        description: "Instead of listing ids: one SELECT returning an id column, e.g. SELECT id FROM \"confirmed__finances__movements\" WHERE date IS NULL OR value IS NULL. Every row it returns is marked, however many — this is not capped at the 200 rows a read returns.",
      },
      marked: { type: 'boolean', description: 'true marks (default); false unmarks.' },
      reason: { type: 'string' },
    },
    required: ['table'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const listed = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : []
    let rowIds = listed
    if (typeof args.selectIds === 'string' && args.selectIds.trim()) {
      try {
        rowIds = [...listed, ...await idsFrom(args.selectIds)]
      } catch (error) { return `Error: ${error instanceof Error ? error.message : 'that query could not run.'}` }
    }
    if (rowIds.length === 0) return 'Error: pass rowIds, or a selectIds query that returns some.'
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
  description: "Adds a row directly to a confirmed table. Two uses, and no others: correcting a row — pass the row_id of the one you are replacing and mark that one for elimination — or recording something the files never carried. Never edit a row in place; the pair of an added row and a marked one is what keeps the history readable. Money is a row's value, signed the way this app means it — negative left, positive arrived — while amount is units of a thing and price is what one unit was worth.",
  parameters: {
    type: 'object',
    properties: {
      rowId: { type: 'string', description: 'The id of the row being corrected, or one from new_row_id.' },
      section: { type: 'string' },
      screen: { type: 'string' },
      date: { type: 'string', description: 'Any readable date; day-first is understood.' },
      value: { type: 'number', description: 'Money that moved, signed: negative left, positive arrived.' },
      amount: { type: 'number', description: 'Units of the asset, for an investment row. Not money.' },
      price: { type: 'number', description: 'What one unit was worth.' },
      asset: { type: 'string' },
      observations: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      account: { type: 'string', description: "One of the user's accounts, by name." },
      card: { type: 'string', description: "One of the user's credit cards, by name." },
      sourceFilename: { type: 'string' },
    },
    required: ['rowId', 'section', 'screen'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const catalogue = await loadLabelCatalogue(context.translate)
    const section = resolveSectionLabel(catalogue, String(args.section ?? ''))
    const screen = resolveScreenLabel(catalogue, String(args.screen ?? ''), section ? [section] : undefined)
    if (!section || !screen) return `Error: ${!section ? 'no section' : 'no screen'} is called that. Call list_label_options for what exists.`
    const { parseDateValue } = await import('@/lib/parse-date')
    const row: ConfirmedRow = {
      rowId: String(args.rowId),
      section,
      screen,
      confirmedAt: Date.now(),
      date: parseDateValue(args.date) ?? undefined,
      value: typeof args.value === 'number' ? args.value : undefined,
      amount: typeof args.amount === 'number' ? args.amount : undefined,
      price: typeof args.price === 'number' ? args.price : undefined,
      asset: typeof args.asset === 'string' && args.asset.trim() ? args.asset.trim() : undefined,
      // Where the row came from belongs in the observations with everything else a file
      // said; there is no column of its own repeating it.
      observations: withObservation(
        typeof args.observations === 'string' && args.observations.trim() ? args.observations : '{}',
        SOURCE_FILENAME_KEY,
        typeof args.sourceFilename === 'string' && args.sourceFilename.trim() ? args.sourceFilename.trim() : 'added by the assistant',
      ),
      category: typeof args.category === 'string' && args.category.trim() ? args.category.trim() : 'outros',
      subcategory: typeof args.subcategory === 'string' && args.subcategory.trim() ? args.subcategory.trim() : 'outros',
      account: typeof args.account === 'string' ? resolveAccountLabel(catalogue, args.account) : undefined,
      card: typeof args.card === 'string' ? resolveCardLabel(catalogue, args.card) : undefined,
    }
    for (const [field, given] of [['account', args.account], ['card', args.card]] as const) {
      if (typeof given === 'string' && given.trim() && !row[field]) {
        return `Error: no ${field} is called "${given}". Call list_label_options for the ones that exist, or leave it out.`
      }
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
    // Loaded, not built: a catalogue without the user's accounts and cards says no
    // account is called anything, and every row is judged unlabelled.
    const catalogue = await loadLabelCatalogue(context.translate)
    try {
      const plan = await planConfirmation(args.sourceId, catalogue)
      if (args.discardMarked === true && args.confirmed !== true) {
        return JSON.stringify({ confirmed: false, plan: { ready: plan.ready.length, incomplete: plan.incomplete.length, marked: plan.marked.length }, next: 'This also drops the marked rows and retires the file. Tell the user exactly what that moves, and call again with confirmed: true once they agree.' })
      }
      const result = await confirmSourceRows(args.sourceId, catalogue, { discardMarked: args.discardMarked === true })
      // A count of what did not move says nothing about why, and "confirmed: 0" with no
      // reason is the least useful thing this could say. The reasons come back with it.
      return JSON.stringify({ ...result, blocking: await reasonsRowsWereLeft(args.sourceId, catalogue) })
    } catch (error) { return `Error: ${error instanceof Error ? error.message : 'could not confirm those rows.'}` }
  },
}

/** What is still missing from the rows a file could not confirm, counted by reason. */
async function reasonsRowsWereLeft(sourceId: number, catalogue: LabelCatalogue): Promise<Record<string, number>> {
  const stored = await sourceFilesTable.get(sourceId)
  if (!stored) return {}
  const file = stored.data as SourceFile
  const reasons: Record<string, number> = {}

  for (const record of await sourceRowsTable.toArray()) {
    const row = record.data as SourceRow
    if (row.sourceId !== sourceId || row.markedForElimination) continue
    const placed = placementsOf(row.labels, catalogue).length > 0
    const errors = [
      ...ingestionLabelErrors(row.labels, catalogue),
      ...(placed ? missingAssignments(row, file, catalogue) : ['The section and screen it names are not a pair the app has.']),
    ]
    for (const error of errors) reasons[error] = (reasons[error] ?? 0) + 1
  }
  return reasons
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
  description: "Lists what the closed labels may be set to right now: the app's sections and the screens inside each, with the id to store and the name currently shown, plus the accounts and credit cards the user has set up. These follow the app and the user's own settings, so read them here rather than remembering them, and never invent one. Category and subcategory are free text and need no list.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async (_args, context) => {
    const catalogue = await loadLabelCatalogue(context.translate)
    return JSON.stringify({
      sections: catalogue.sections,
      screens: catalogue.screens,
      note: 'Store the id. A row may name several of each; a screen is only valid inside a section the row names.',
    })
  },
}
