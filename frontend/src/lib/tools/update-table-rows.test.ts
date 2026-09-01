import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalStores } from '@/lib/local-store/test-utils'
import { useSpendingStore } from '@/sections/finances/spending-store'
import { updateTableRowsTool } from './update-table-rows'

const context = { attachments: [] }

async function seedRow() {
  const id = await useSpendingStore
    .getState()
    .addItem({ date: Date.parse('2026-01-01'), category: 'Outros', amount: 10, note: 'original' })
  return id
}

describe('updateTableRowsTool', () => {
  beforeEach(async () => {
    await clearLocalStores(useSpendingStore)
  })

  it('errors on an unknown table', async () => {
    const result = await updateTableRowsTool.execute({ table: 'nope', updates: [{ id: 1, fields: {} }] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('errors when updates is missing, not an array, or empty', async () => {
    expect(await updateTableRowsTool.execute({ table: 'spending' }, context)).toContain('"updates" argument')
    expect(await updateTableRowsTool.execute({ table: 'spending', updates: [] }, context)).toContain('"updates" argument')
  })

  it('reports an unknown id', async () => {
    const result = await updateTableRowsTool.execute(
      { table: 'spending', updates: [{ id: 999, fields: { amount: 5 } }] },
      context,
    )
    expect(result).toContain('id 999: not found')
  })

  it('rejects an unknown field name (including id/createdAt/deleted)', async () => {
    const id = await seedRow()
    for (const badField of ['bogus', 'id', 'createdAt', 'deleted']) {
      const result = await updateTableRowsTool.execute(
        { table: 'spending', updates: [{ id, fields: { [badField]: 'x' } }] },
        context,
      )
      expect(result).toContain(`unknown field "${badField}"`)
    }
  })

  it('rejects an invalid field value', async () => {
    const id = await seedRow()
    const result = await updateTableRowsTool.execute(
      { table: 'spending', updates: [{ id, fields: { amount: 'not-a-number' } }] },
      context,
    )
    expect(result).toContain('is not a number')
    expect(useSpendingStore.getState().items).toHaveLength(1)
  })

  it('accepts a category outside the suggested options — the vocabulary is open', async () => {
    const id = await seedRow()
    const result = await updateTableRowsTool.execute(
      { table: 'spending', updates: [{ id, fields: { category: 'Categoria Nova' } }] },
      context,
    )
    expect(result).not.toContain('Error')
    expect(useSpendingStore.getState().items.some((r) => r.category === 'Categoria Nova')).toBe(true)
  })

  it('rejects empty fields', async () => {
    const id = await seedRow()
    const result = await updateTableRowsTool.execute({ table: 'spending', updates: [{ id, fields: {} }] }, context)
    expect(result).toContain('no fields given')
  })

  it('processes a duplicate id in the same call only once', async () => {
    const id = await seedRow()
    const result = await updateTableRowsTool.execute(
      {
        table: 'spending',
        updates: [
          { id, fields: { amount: 20 } },
          { id, fields: { amount: 30 } },
        ],
      },
      context,
    )
    expect(result).toContain('duplicate in this call')
    expect(useSpendingStore.getState().items.filter((r) => !r.deleted)).toHaveLength(1)
  })

  it('flags the old row and creates a new corrected one, merging unspecified fields', async () => {
    const id = await seedRow()

    const result = await updateTableRowsTool.execute(
      { table: 'spending', updates: [{ id, fields: { amount: 42, category: 'Lazer' } }] },
      context,
    )

    const items = useSpendingStore.getState().items
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
})
