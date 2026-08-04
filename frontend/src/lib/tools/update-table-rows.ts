import { coerceValue } from '@/lib/csv'
import { useVaultStore } from '@/store/vault-store'
import { findWritableTable, writableTables } from './writable-tables'
import type { ToolDefinition } from './types'

function buildDescription(): string {
  const tableList = writableTables.map((t) => `"${t.key}" (${t.label})`).join(', ')
  return (
    'Corrects existing rows (wrong/mislabeled/misdated data) in a finance/investment table. This never edits ' +
    'a row in place: the original row is flagged deleted (hidden/faded in the app, not physically removed — ' +
    'restore_table_rows is the only way to undo this) and a new row is created with the corrected values, so ' +
    'the change history stays visible. Use read_table first to find the row id(s) to correct. Only include the ' +
    'fields that are actually changing in each update — unspecified fields keep their current value. ' +
    `Available tables and their columns follow the same shape write_to_table documents. Available tables: ${tableList}.`
  )
}

export const updateTableRowsTool: ToolDefinition = {
  name: 'update_table_rows',
  description: buildDescription(),
  parameters: {
    type: 'object',
    properties: {
      table: {
        type: 'string',
        enum: writableTables.map((t) => t.key),
        description: 'Which table the rows belong to.',
      },
      updates: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number', description: 'id of the existing row to correct (from read_table).' },
            fields: {
              type: 'object',
              description: 'Only the columns to change — others keep their current value.',
            },
          },
          required: ['id', 'fields'],
        },
        description: 'One entry per row to correct.',
      },
    },
    required: ['table', 'updates'],
    additionalProperties: false,
  },
  execute: async (args) => {
    if (!useVaultStore.getState().passphrase) {
      return 'Error: vault is locked — unlock it (Vault → Get Started) before modifying data.'
    }

    const tableKey = typeof args.table === 'string' ? args.table : undefined
    if (!tableKey) return 'Error: "table" argument missing or not a string.'

    const table = findWritableTable(tableKey)
    if (!table) {
      return `Error: unknown table "${tableKey}". Valid tables: ${writableTables.map((t) => t.key).join(', ')}.`
    }

    if (!Array.isArray(args.updates) || args.updates.length === 0) {
      return 'Error: "updates" argument missing, not an array, or empty.'
    }

    const items = table.useStore.getState().items
    const seen = new Set<number>()
    const results: string[] = []

    for (const rawUpdate of args.updates as unknown[]) {
      if (typeof rawUpdate !== 'object' || rawUpdate === null) {
        results.push('update: not an object, skipped')
        continue
      }
      const { id, fields } = rawUpdate as { id?: unknown; fields?: unknown }
      if (typeof id !== 'number') {
        results.push('update: "id" missing or not a number, skipped')
        continue
      }
      if (seen.has(id)) {
        results.push(`id ${id}: duplicate in this call, skipped`)
        continue
      }
      seen.add(id)

      const existing = items.find((r) => (r as { id: number }).id === id)
      if (!existing) {
        results.push(`id ${id}: not found in "${tableKey}"`)
        continue
      }

      if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        results.push(`id ${id}: "fields" missing or not an object`)
        continue
      }
      const fieldEntries = Object.entries(fields as Record<string, unknown>)
      if (fieldEntries.length === 0) {
        results.push(`id ${id}: no fields given`)
        continue
      }

      const { id: _id, createdAt: _createdAt, deleted: _deleted, ...rest } = existing as Record<string, unknown>
      const coerced: Record<string, unknown> = {}
      let fieldError: string | null = null

      for (const [key, rawValue] of fieldEntries) {
        const col = table.schema.find((c) => String(c.key) === key)
        if (!col) {
          fieldError = `unknown field "${key}" for table "${tableKey}"`
          break
        }
        const asString = rawValue === undefined || rawValue === null ? '' : String(rawValue)
        const result = coerceValue(col, asString)
        if (!result.ok) {
          fieldError = result.message
          break
        }
        coerced[key] = result.value
      }

      if (fieldError) {
        results.push(`id ${id}: ${fieldError}`)
        continue
      }

      const newValue = { ...rest, ...coerced }
      let newId: number
      try {
        newId = await table.useStore.getState().addItem(newValue)
      } catch {
        results.push(`id ${id}: failed to write corrected row, original left unchanged`)
        continue
      }

      try {
        await table.useStore.getState().updateItem(id, { ...rest, deleted: true })
      } catch {
        results.push(`id ${id}: corrected row ${newId} created, but failed to flag the original — flag it manually`)
        continue
      }

      const changes = Object.keys(coerced).map((k) => `${k}: ${String((existing as Record<string, unknown>)[k])} -> ${String(coerced[k])}`)
      results.push(`id ${id} -> id ${newId}: ${changes.join(', ')}`)
    }

    return results.join('\n')
  },
}
