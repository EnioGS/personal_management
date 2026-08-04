import { beforeEach, describe, expect, it } from 'vitest'
import { useSpendingStore } from '@/sections/finances/spending-store'
import { useVaultStore } from '@/store/vault-store'
import { deleteTableRowsTool } from './delete-table-rows'

const context = { attachments: [] }

function unlock() {
  useVaultStore.getState().unlock(`pw-${crypto.randomUUID()}`)
}

describe('deleteTableRowsTool', () => {
  beforeEach(() => {
    useVaultStore.getState().lock()
    useSpendingStore.setState({ items: [] })
  })

  it('errors when the vault is locked', async () => {
    const result = await deleteTableRowsTool.execute({ table: 'spending', ids: [1] }, context)
    expect(result).toContain('vault is locked')
  })

  it('errors on an unknown table', async () => {
    unlock()
    const result = await deleteTableRowsTool.execute({ table: 'nope', ids: [1] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('errors when ids is missing, not an array, or empty', async () => {
    unlock()
    expect(await deleteTableRowsTool.execute({ table: 'spending' }, context)).toContain('"ids" argument')
    expect(await deleteTableRowsTool.execute({ table: 'spending', ids: [] }, context)).toContain('"ids" argument')
  })

  it('reports an unknown id', async () => {
    unlock()
    const result = await deleteTableRowsTool.execute({ table: 'spending', ids: [999] }, context)
    expect(result).toContain('id 999: not found')
  })

  it('flags a row deleted without removing it from items', async () => {
    unlock()
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })

    const result = await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)

    expect(result).toContain(`id ${id}: flagged deleted`)
    const row = useSpendingStore.getState().items.find((r) => r.id === id)
    expect(row).toBeTruthy()
    expect(row?.deleted).toBe(true)
  })

  it('reports an already-flagged row as a no-op instead of erroring', async () => {
    unlock()
    const id = await useSpendingStore.getState().addItem({ date: Date.now(), category: 'Outros', amount: 10 })
    await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)

    const result = await deleteTableRowsTool.execute({ table: 'spending', ids: [id] }, context)
    expect(result).toContain('already flagged, unchanged')
  })
})
