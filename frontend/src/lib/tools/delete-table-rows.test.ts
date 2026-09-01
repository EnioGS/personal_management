import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalStores } from '@/lib/local-store/test-utils'
import { useSpendingStore } from '@/sections/finances/spending-store'
import { deleteTableRowsTool } from './delete-table-rows'

const context = { attachments: [] }

describe('deleteTableRowsTool', () => {
  beforeEach(async () => {
    await clearLocalStores(useSpendingStore)
  })

  it('errors on an unknown table', async () => {
    const result = await deleteTableRowsTool.execute({ table: 'nope', ids: [1] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('errors when ids is missing, not an array, or empty', async () => {
    expect(await deleteTableRowsTool.execute({ table: 'spending' }, context)).toContain('"ids" argument')
    expect(await deleteTableRowsTool.execute({ table: 'spending', ids: [] }, context)).toContain('"ids" argument')
  })

  it('reports an unknown id', async () => {
    const result = await deleteTableRowsTool.execute({ table: 'spending', ids: [999] }, context)
    expect(result).toContain('id 999: not found')
  })

  it('flags a row deleted without removing it from items', async () => {
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })

    const result = await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)

    expect(result).toContain(`id ${id}: flagged deleted`)
    const row = useSpendingStore.getState().items.find((r) => r.id === id)
    expect(row).toBeTruthy()
    expect(row?.deleted).toBe(true)
  })

  it('reports an already-flagged row as a no-op instead of erroring', async () => {
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })
    await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)

    const result = await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)
    expect(result).toContain('already flagged, unchanged')
  })
})
