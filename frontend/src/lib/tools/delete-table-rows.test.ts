import { beforeEach, describe, expect, it } from 'vitest'
import { addItemFor, itemsFor } from './writable-tables'
import { clearTables, seedTable } from './test-utils'
import { deleteTableRowsTool } from './delete-table-rows'

const context = { attachments: [] }

describe('deleteTableRowsTool', () => {
  beforeEach(clearTables)

  it('errors on an unknown table', async () => {
    const result = await deleteTableRowsTool.execute({ table: 'nope', ids: [1] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('errors when ids is missing, not an array, or empty', async () => {
    const table = await seedTable('generic')
    expect(await deleteTableRowsTool.execute({ table }, context)).toContain('"ids" argument')
    expect(await deleteTableRowsTool.execute({ table, ids: [] }, context)).toContain('"ids" argument')
  })

  it('reports an unknown id', async () => {
    const table = await seedTable('generic')
    const result = await deleteTableRowsTool.execute({ table, ids: [999] }, context)
    expect(result).toContain('id 999: not found')
  })

  it('flags a row deleted without removing it from items', async () => {
    const table = await seedTable('generic')
    const id = await addItemFor(Number(table), { date: Date.now(), category: 'Outros', amount: 10 })

    const result = await deleteTableRowsTool.execute({ table, ids: [id] }, context)

    expect(result).toContain(`id ${id}: flagged deleted`)
    const row = itemsFor(Number(table)).find((r) => r.id === id)
    expect(row).toBeTruthy()
    expect(row?.deleted).toBe(true)
  })

  it('reports an already-flagged row as a no-op instead of erroring', async () => {
    const table = await seedTable('generic')
    const id = await addItemFor(Number(table), { date: Date.now(), category: 'Outros', amount: 10 })
    await deleteTableRowsTool.execute({ table, ids: [id] }, context)

    const result = await deleteTableRowsTool.execute({ table, ids: [id] }, context)
    expect(result).toContain('already flagged, unchanged')
  })
})
