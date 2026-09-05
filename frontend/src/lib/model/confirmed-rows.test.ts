import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { addConfirmedRow, updateConfirmedRow } from './confirmed-rows'
import { confirmedRowsTable } from './model-db'
import type { ConfirmedRow } from './types'

async function only(): Promise<ConfirmedRow> {
  return (await confirmedRowsTable.toArray())[0].data as ConfirmedRow
}

describe('a row added by hand', () => {
  beforeEach(async () => { await wipeAllData() })

  it('lands in the table it was added to, with an id of its own', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    const row = await only()

    expect(id).toBeDefined()
    expect(row).toMatchObject({ section: 'finances', screen: 'spending', category: 'outros', subcategory: 'outros' })
    expect(row.rowId).toMatch(/^[0-9a-f]{16}$/)
  })

  it('says where it came from rather than borrowing a filename', async () => {
    await addConfirmedRow('finances', 'overview')
    expect((await only()).sourceFilename).toBe('added by hand')
  })
})

describe('editing a confirmed cell', () => {
  beforeEach(async () => { await wipeAllData() })

  it('reads a date day-first and an amount with either decimal mark, like an import does', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    await updateConfirmedRow(id, 'date', '15/08/2025')
    await updateConfirmedRow(id, 'amount', '-1.234,56')

    expect(await only()).toMatchObject({ date: Date.UTC(2025, 7, 15), amount: -1234.56 })
  })

  it('puts the default meaning back when a meaning cell is emptied', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    await updateConfirmedRow(id, 'category', 'mercado')
    expect((await only()).category).toBe('mercado')

    await updateConfirmedRow(id, 'category', '   ')
    expect((await only()).category).toBe('outros')
  })
})
