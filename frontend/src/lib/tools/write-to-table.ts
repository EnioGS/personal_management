import { coerceValue } from '@/lib/csv'
import { addItemsFor, describeWritableTable, findWritableTable, writableTables } from './writable-tables'
import type { ToolDefinition } from './types'

function describeColumn(col: ReturnType<typeof writableTables>[number]['schema'][number]): string {
  let desc = `${String(col.key)} (${col.type}`
  if (col.type === 'select' && col.options) desc += `: ${col.options.join('|')}`
  if (col.type === 'combobox' && col.options) desc += `, existing values: ${col.options.join('|')}`
  if (col.required) desc += ', required'
  desc += ')'
  return desc
}

/** Regenerated from writableTables() on every call — a new table needs no changes here. */
function buildDescription(): string {
  const tables = writableTables()
  const tableDocs = tables.map((t) => `- ${describeWritableTable(t)}: ${t.schema.map(describeColumn).join(', ')}`).join('\n')

  return (
    "Appends one or more rows to a table in the user's records. " +
    'Writes immediately — the user can review, edit, or delete rows afterward in the app UI. ' +
    'Dates must be ISO 8601 strings (e.g. "2026-07-31") or epoch milliseconds; numbers must be plain ' +
    'numeric values — strip currency symbols, thousands separators, and locale decimal commas first. ' +
    'A "select" column accepts only its listed values: map differently-worded source data to the closest ' +
    'one yourself rather than passing the original text through — anything else is rejected. ' +
    'A "combobox" column is an open vocabulary: its listed values are the ones already in use, not a ' +
    'restriction. Strongly prefer reusing an existing value when one clearly fits (e.g. "Supermercado" or ' +
    '"Mercado" → "Alimentação") so the vocabulary does not fragment into near-duplicates, but introduce a ' +
    'new value when nothing fits rather than forcing a bad match. ' +
    'Whenever you make a judgment call like this (mapping a category, reformatting a date, cleaning up a ' +
    'number, choosing which of several similar source columns to use), briefly say so in your reply so the ' +
    'user can correct it if your interpretation was wrong — do not apply silent guesses. ' +
    'Rows that still fail validation after your best mapping attempt are skipped and reported back; valid ' +
    'rows in the same call are still written.\n' +
    `Available tables and their columns:\n${tableDocs || '(none yet — tell the user to create a table in the app first)'}`
  )
}

export const writeToTableTool: ToolDefinition = {
  name: 'write_to_table',
  get description() {
    return buildDescription()
  },
  get parameters() {
    return {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          enum: writableTables().map((t) => t.key),
          description: 'Which table to write rows into.',
        },
        rows: {
          type: 'array',
          items: { type: 'object' },
          description: "One object per row, with fields matching the target table's columns (see tool description).",
        },
      },
      required: ['table', 'rows'],
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

    if (!Array.isArray(args.rows) || args.rows.length === 0) {
      return 'Error: "rows" argument missing, not an array, or empty.'
    }

    const validRows: Record<string, unknown>[] = []
    const rowErrors: string[] = []

    args.rows.forEach((rawRow: unknown, index: number) => {
      if (typeof rawRow !== 'object' || rawRow === null || Array.isArray(rawRow)) {
        rowErrors.push(`row ${index + 1}: not an object`)
        return
      }
      const row: Record<string, unknown> = {}
      let firstError: string | null = null

      for (const col of table.schema) {
        const key = String(col.key)
        const rawValue = (rawRow as Record<string, unknown>)[key]
        const asString = rawValue === undefined || rawValue === null ? '' : String(rawValue)
        const result = coerceValue(col, asString)
        if (!result.ok) {
          firstError = result.message
          break
        }
        row[key] = result.value
      }

      if (firstError) rowErrors.push(`row ${index + 1}: ${firstError}`)
      else validRows.push(row)
    })

    if (validRows.length > 0) {
      try {
        await addItemsFor(table.tableId, validRows)
      } catch {
        return `Error: failed to write rows to "${tableKey}" (storage error). No rows were written. Row errors, if any: ${rowErrors.join('; ') || 'none'}`
      }
    }

    const summary = `Wrote ${validRows.length} of ${args.rows.length} row(s) to "${tableKey}".`
    if (rowErrors.length === 0) return summary
    return `${summary} Rejected rows:\n${rowErrors.join('\n')}`
  },
}
