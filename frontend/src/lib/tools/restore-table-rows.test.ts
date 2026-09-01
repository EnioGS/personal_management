import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalStores } from '@/lib/local-store/test-utils'
import { useSpendingStore } from '@/sections/finances/spending-store'
import { deleteTableRowsTool } from './delete-table-rows'
import { restoreTableRowsTool } from './restore-table-rows'

const context = { attachments: [] }

describe('restoreTableRowsTool', () => {
  beforeEach(async () => {
    await clearLocalStores(useSpendingStore)
  })

  it('errors on an unknown table', async () => {
    const result = await restoreTableRowsTool.execute({ table: 'nope', ids: [1] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('reports an unknown id', async () => {
    const result = await restoreTableRowsTool.execute({ table: 'spending', ids: [999] }, context)
    expect(result).toContain('id 999: not found')
  })

  it('reports a not-currently-flagged row as a no-op instead of erroring', async () => {
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })
    const result = await restoreTableRowsTool.execute({ table: 'spending', ids: [id] }, context)
    expect(result).toContain('not currently flagged, unchanged')
  })

  it('flags then restores a row, clearing the deleted flag', async () => {
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })
    await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)
    expect(useSpendingStore.getState().items.find((r) => r.id === id)?.deleted).toBe(true)

    const result = await restoreTableRowsTool.execute({ table: 'spending', ids: [id] }, context)

    expect(result).toContain(`id ${id}: restored`)
    expect(useSpendingStore.getState().items.find((r) => r.id === id)?.deleted).toBe(false)
  })
})
