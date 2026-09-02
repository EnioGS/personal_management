import { beforeEach, describe, expect, it } from 'vitest'
import { addItemFor, itemsFor } from './writable-tables'
import { clearTables, seedTable } from './test-utils'
import { updateTableRowsTool } from './update-table-rows'

const context = { attachments: [] }

async function seedRow(tableId: number) {
  return addItemFor(tableId, { date: Date.parse('2026-01-01'), category: 'Outros', amount: 10, note: 'original' })
}

describe('updateTableRowsTool', () => {
  beforeEach(clearTables)

  it('errors on an unknown table', async () => {
    const result = await updateTableRowsTool.execute({ table: 'nope', updates: [{ id: 1, fields: {} }] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('errors when updates is missing, not an array, or empty', async () => {
    const table = await seedTable('generic')
    expect(await updateTableRowsTool.execute({ table }, context)).toContain('"updates" argument')
    expect(await updateTableRowsTool.execute({ table, updates: [] }, context)).toContain('"updates" argument')
  })

  it('reports an unknown id', async () => {
    const table = await seedTable('generic')
    const result = await updateTableRowsTool.execute({ table, updates: [{ id: 999, fields: { amount: 5 } }] }, context)
    expect(result).toContain('id 999: not found')
  })

  it('rejects an unknown field name (including id/createdAt/deleted/tableId)', async () => {
    const table = await seedTable('generic')
    const id = await seedRow(Number(table))
    for (const badField of ['bogus', 'id', 'createdAt', 'deleted', 'tableId']) {
      const result = await updateTableRowsTool.execute({ table, updates: [{ id, fields: { [badField]: 'x' } }] }, context)
      expect(result).toContain(`unknown field "${badField}"`)
    }
  })

  it('rejects an invalid field value', async () => {
    const table = await seedTable('generic')
    const id = await seedRow(Number(table))
    const result = await updateTableRowsTool.execute(
      { table, updates: [{ id, fields: { amount: 'not-a-number' } }] },
      context,
    )
    expect(result).toContain('is not a number')
    expect(itemsFor(Number(table))).toHaveLength(1)
  })

  it('accepts a category outside the suggested options — the vocabulary is open', async () => {
    const table = await seedTable('generic')
    const id = await seedRow(Number(table))
    const result = await updateTableRowsTool.execute(
      { table, updates: [{ id, fields: { category: 'Categoria Nova' } }] },
      context,
    )
    expect(result).not.toContain('Error')
    expect(itemsFor(Number(table)).some((r) => r.category === 'Categoria Nova')).toBe(true)
  })

  it('rejects empty fields', async () => {
    const table = await seedTable('generic')
    const id = await seedRow(Number(table))
    const result = await updateTableRowsTool.execute({ table, updates: [{ id, fields: {} }] }, context)
    expect(result).toContain('no fields given')
  })

  it('processes a duplicate id in the same call only once', async () => {
    const table = await seedTable('generic')
    const id = await seedRow(Number(table))
    const result = await updateTableRowsTool.execute(
      {
        table,
        updates: [
          { id, fields: { amount: 20 } },
          { id, fields: { amount: 30 } },
        ],
      },
      context,
    )
    expect(result).toContain('duplicate in this call')
    expect(itemsFor(Number(table)).filter((r) => !r.deleted)).toHaveLength(1)
  })

  it('flags the old row and creates a new corrected one, merging unspecified fields', async () => {
    const table = await seedTable('generic')
    const id = await seedRow(Number(table))

    const result = await updateTableRowsTool.execute(
      { table, updates: [{ id, fields: { amount: 42, category: 'Lazer' } }] },
      context,
    )

    const items = itemsFor(Number(table))
    const oldRow = items.find((r) => r.id === id)
    expect(oldRow?.deleted).toBe(true)

    const newRows = items.filter((r) => r.id !== id && !r.deleted)
    expect(newRows).toHaveLength(1)
    expect(newRows[0].amount).toBe(42)
    expect(newRows[0].category).toBe('Lazer')
    expect(newRows[0].note).toBe('original') // unspecified field carried over
    expect(newRows[0].date).toBe(oldRow?.date)

    expect(result).toContain(`id ${id} -> id ${newRows[0].id}`)
    expect(result).toContain('amount: 10 -> 42')
    expect(result).toContain('category: Outros -> Lazer')
  })

  it('keeps the corrected row tagged to the same table', async () => {
    const table = await seedTable('generic')
    const id = await seedRow(Number(table))

    await updateTableRowsTool.execute({ table, updates: [{ id, fields: { amount: 42 } }] }, context)

    const newRow = itemsFor(Number(table)).find((r) => r.id !== id && !r.deleted)
    expect(newRow?.tableId).toBe(Number(table))
  })
})
