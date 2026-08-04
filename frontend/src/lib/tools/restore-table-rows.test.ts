import { beforeEach, describe, expect, it } from 'vitest'
import { useSpendingStore } from '@/sections/finances/spending-store'
import { useVaultStore } from '@/store/vault-store'
import { deleteTableRowsTool } from './delete-table-rows'
import { restoreTableRowsTool } from './restore-table-rows'

const context = { attachments: [] }

function unlock() {
  useVaultStore.getState().unlock(`pw-${crypto.randomUUID()}`)
}

describe('restoreTableRowsTool', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useSpendingStore.setState({ items: [] })
  })

  it('errors when the vault is locked', async () => {
    const result = await restoreTableRowsTool.execute({ table: 'spending', ids: [1] }, context)
    expect(result).toContain('vault is locked')
  })

  it('errors on an unknown table', async () => {
    unlock()
    const result = await restoreTableRowsTool.execute({ table: 'nope', ids: [1] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('reports an unknown id', async () => {
    unlock()
    const result = await restoreTableRowsTool.execute({ table: 'spending', ids: [999] }, context)
    expect(result).toContain('id 999: not found')
  })

  it('reports a not-currently-flagged row as a no-op instead of erroring', async () => {
    unlock()
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })
    const result = await restoreTableRowsTool.execute({ table: 'spending', ids: [id] }, context)
    expect(result).toContain('not currently flagged, unchanged')
  })

  it('flags then restores a row, clearing the deleted flag', async () => {
    unlock()
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })
    await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)
    expect(useSpendingStore.getState().items.find((r) => r.id === id)?.deleted).toBe(true)

    const result = await restoreTableRowsTool.execute({ table: 'spending', ids: [id] }, context)

    expect(result).toContain(`id ${id}: restored`)
    expect(useSpendingStore.getState().items.find((r) => r.id === id)?.deleted).toBe(false)
  })
})
