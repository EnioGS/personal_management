import { beforeEach, describe, expect, it } from 'vitest'
import { addItemFor, itemsFor } from './writable-tables'
import { clearTables, seedTable } from './test-utils'
import { deleteTableRowsTool } from './delete-table-rows'
import { restoreTableRowsTool } from './restore-table-rows'

const context = { attachments: [] }

describe('restoreTableRowsTool', () => {
  beforeEach(clearTables)

  it('errors on an unknown table', async () => {
    const result = await restoreTableRowsTool.execute({ table: 'nope', ids: [1] }, context)
    expect(result).toContain('unknown table "nope"')
  })

  it('reports an unknown id', async () => {
    const table = await seedTable('generic')
    const result = await restoreTableRowsTool.execute({ table, ids: [999] }, context)
    expect(result).toContain('id 999: not found')
  })

  it('reports a not-currently-flagged row as a no-op instead of erroring', async () => {
    const table = await seedTable('generic')
    const id = await addItemFor(Number(table), { date: Date.now(), category: 'Outros', amount: 10 })
    const result = await restoreTableRowsTool.execute({ table, ids: [id] }, context)
    expect(result).toContain('not currently flagged, unchanged')
  })

  it('flags then restores a row, clearing the deleted flag', async () => {
    const table = await seedTable('generic')
    const id = await addItemFor(Number(table), { date: Date.now(), category: 'Outros', amount: 10 })
    await deleteTableRowsTool.execute({ table, ids: [id] }, context)
    expect(itemsFor(Number(table)).find((r) => r.id === id)?.deleted).toBe(true)

    const result = await restoreTableRowsTool.execute({ table, ids: [id] }, context)

    expect(result).toContain(`id ${id}: restored`)
    expect(itemsFor(Number(table)).find((r) => r.id === id)?.deleted).toBe(false)
  })
})
