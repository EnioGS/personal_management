import { findWritableTable, writableTables } from './writable-tables'
import type { ToolDefinition } from './types'

function buildDescription(): string {
  const tableList = writableTables.map((t) => `"${t.key}" (${t.label})`).join(', ')
  return (
    'Flags one or more rows in a finance/investment table as deleted. This is NOT a physical delete — flagged ' +
    'rows are only hidden/faded in the app, still exist, and are still visible to read_table (tagged ' +
    'deleted=true). Only the user, via the "delete flagged rows" button in the app, can permanently remove ' +
    'them. restore_table_rows is the only way to un-flag a row — use it if you flag something by mistake. ' +
    `Available tables: ${tableList}.`
  )
}

export const deleteTableRowsTool: ToolDefinition = {
  name: 'delete_table_rows',
  description: buildDescription(),
  parameters: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        enum: writableTables.map((t) => t.key),
        description: 'Which table the rows belong to.',
      },
      ids: {
        type: 'array',
        items: { type: 'number' },
        description: 'Row ids to flag as deleted (from read_table).',
      },
    },
    required: ['table', 'ids'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const tableKey = typeof args.table === 'string' ? args.table : undefined
    if (!tableKey) return 'Error: "table" argument missing or not a string.'

    const table = findWritableTable(tableKey)
    if (!table) {
      return `Error: unknown table "${tableKey}". Valid tables: ${writableTables.map((t) => t.key).join(', ')}.`
    }

    if (!Array.isArray(args.ids) || args.ids.length === 0) {
      return 'Error: "ids" argument missing, not an array, or empty.'
    }

    const items = table.useStore.getState().items
    const results: string[] = []

    for (const rawId of args.ids as unknown[]) {
      if (typeof rawId !== 'number') {
        results.push(`id ${String(rawId)}: not a number, skipped`)
        continue
      }
      const existing = items.find((r) => (r as { id: number }).id === rawId)
      if (!existing) {
        results.push(`id ${rawId}: not found in "${tableKey}"`)
        continue
      }
      if ((existing as Record<string, unknown>).deleted) {
        results.push(`id ${rawId}: already flagged, unchanged`)
        continue
      }

      const { id: _id, createdAt: _createdAt, deleted: _deleted, ...rest } = existing as Record<string, unknown>
      try {
        await table.useStore.getState().updateItem(rawId, { ...rest, deleted: true })
        results.push(`id ${rawId}: flagged deleted`)
      } catch {
        results.push(`id ${rawId}: storage error, not changed`)
      }
    }

    return results.join('\n')
  },
}
