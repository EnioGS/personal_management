import { findWritableTable, writableTables } from './writable-tables'
import type { ToolDefinition } from './types'

function buildDescription(): string {
  const tableList = writableTables.map((t) => `"${t.key}" (${t.label})`).join(', ')
  return (
    'Un-flags rows previously flagged deleted by delete_table_rows or update_table_rows, restoring them to ' +
    "normal (visible, counted) rows. This is the only way to undo a delete flag — there's no other tool that " +
    `clears it. Available tables: ${tableList}.`
  )
}

export const restoreTableRowsTool: ToolDefinition = {
  name: 'restore_table_rows',
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
        description: 'Row ids to restore (un-flag).',
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
      if (!(existing as Record<string, unknown>).deleted) {
        results.push(`id ${rawId}: not currently flagged, unchanged`)
        continue
      }

      const { id: _id, createdAt: _createdAt, deleted: _deleted, ...rest } = existing as Record<string, unknown>
      try {
        await table.useStore.getState().updateItem(rawId, { ...rest, deleted: false })
        results.push(`id ${rawId}: restored`)
      } catch {
        results.push(`id ${rawId}: storage error, not changed`)
      }
    }

    return results.join('\n')
  },
}
