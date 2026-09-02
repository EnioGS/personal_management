import Papa from 'papaparse'
import { findWritableTable, itemsFor, writableTables } from './writable-tables'
import type { ToolDefinition } from './types'

const MAX_ROWS = 200

function buildDescription(): string {
  const tableList = writableTables()
    .map((t) => `"${t.key}" (${t.label})`)
    .join(', ')
  return (
    "Reads existing rows from a table in the user's records, optionally scoped to a " +
    'date range. Use this before write_to_table/update_table_rows when reconciling an attached file against ' +
    'existing data — e.g. to avoid adding rows that are already present, or to find rows that need correcting. ' +
    'Rows may carry a "deleted" flag: such rows are hidden/faded in the app but not physically removed — this ' +
    'tool still returns them (tagged deleted=true) so you can reason about them; treat them as superseded/' +
    'historical, not current data, unless the user is specifically asking about deleted entries. ' +
    'For a period like one statement month, set dateFrom/dateTo to that period rather than omitting them — ' +
    `large unscoped reads are rejected with just a count instead of the actual rows. Available tables: ${tableList || '(none yet — the user has not created any)'}.`
  )
}

export const readTableTool: ToolDefinition = {
  name: 'read_table',
  get description() {
    return buildDescription()
  },
  get parameters() {
    return {
      type: 'object',
      properties: {
        table: { type: 'string', enum: writableTables().map((t) => t.key), description: 'Which table to read.' },
        dateFrom: { type: 'string', description: 'Inclusive start date, "YYYY-MM-DD". Omit for no lower bound.' },
        dateTo: { type: 'string', description: 'Inclusive end date, "YYYY-MM-DD". Omit for no upper bound.' },
      },
      required: ['table'],
      additionalProperties: false,
    }
  },
  execute: async (args) => {
    const tableKey = typeof args.table === 'string' ? args.table : undefined
    if (!tableKey) return 'Error: "table" argument missing or not a string.'

    const table = findWritableTable(tableKey)
    if (!table) {
      return `Error: unknown table "${tableKey}". Valid tables: ${writableTables()
        .map((t) => t.key)
        .join(', ')}.`
    }

    let fromMs = -Infinity
    let toMs = Infinity
    if (typeof args.dateFrom === 'string' && args.dateFrom) {
      const parsed = Date.parse(args.dateFrom)
      if (Number.isNaN(parsed)) return `Error: "dateFrom" is not a valid date: "${args.dateFrom}".`
      fromMs = parsed
    }
    if (typeof args.dateTo === 'string' && args.dateTo) {
      const parsed = Date.parse(args.dateTo)
      if (Number.isNaN(parsed)) return `Error: "dateTo" is not a valid date: "${args.dateTo}".`
      toMs = parsed
    }

    const allItems = itemsFor(table.tableId)
    const filtered = allItems
      .filter((row) => {
        const date = (row as Record<string, unknown>).date
        return typeof date === 'number' && date >= fromMs && date <= toMs
      })
      .sort((a, b) => (a as Record<string, number>).date - (b as Record<string, number>).date)

    if (filtered.length > MAX_ROWS) {
      return (
        `Table "${tableKey}" has ${filtered.length} matching row(s) — too many to return at once. ` +
        'Narrow the range with dateFrom/dateTo (e.g. to the statement period you are reconciling).'
      )
    }

    const flaggedCount = filtered.filter((row) => Boolean((row as Record<string, unknown>).deleted)).length
    const columns = table.schema.map((c) => String(c.key))
    const fields = ['id', ...columns, 'deleted']
    const data = filtered.map((row) => {
      const record = row as Record<string, unknown>
      return fields.map((f) => {
        if (f === 'deleted') return record.deleted ? 'true' : 'false'
        if (f === 'date' && typeof record.date === 'number') return new Date(record.date).toISOString().slice(0, 10)
        return record[f] ?? ''
      })
    })
    const csv = Papa.unparse({ fields, data })

    return (
      `Table "${tableKey}": ${filtered.length} row(s) (${flaggedCount} flagged deleted) of ${allItems.length} total.\n` +
      csv
    )
  },
}
