import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { addConfirmedRow, fillFromObservations, placeConfirmedRow, updateConfirmedRow } from './confirmed-rows'
import { confirmedRowsTable } from './model-db'
import { sourceFilenameOf } from './observations'
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

  it('says where it came from in the observations, where every row keeps that', async () => {
    await addConfirmedRow('finances', 'overview')
    expect(sourceFilenameOf((await only()).observations)).toBe('added by hand')
  })
})

describe('editing a confirmed cell', () => {
  beforeEach(async () => { await wipeAllData() })

  it('reads a date day-first and an amount with either decimal mark, like an import does', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    await updateConfirmedRow(id, 'date', '15/08/2025')
    await updateConfirmedRow(id, 'value', '-1.234,56')

    expect(await only()).toMatchObject({ date: Date.UTC(2025, 7, 15), value: -1234.56 })
  })

  it('puts the default meaning back when a meaning cell is emptied', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    await updateConfirmedRow(id, 'category', 'mercado')
    expect((await only()).category).toBe('mercado')

    await updateConfirmedRow(id, 'category', '   ')
    expect((await only()).category).toBe('outros')
  })
})

describe('re-placing a confirmed row', () => {
  beforeEach(async () => { await wipeAllData() })

  it('moves it to the table its new section and screen name, keeping its id', async () => {
    const id = await addConfirmedRow('finances', 'overview')
    const { rowId } = await only()

    await placeConfirmedRow(id, { section: 'finances', screen: 'spending' })

    expect(await confirmedRowsTable.count()).toBe(1)
    expect(await only()).toMatchObject({ section: 'finances', screen: 'spending', rowId })
  })

  it('copies it into a second table when the row belongs in both, sharing the one id', async () => {
    const id = await addConfirmedRow('finances', 'overview')

    await placeConfirmedRow(id, { section: 'finances', screen: 'spending' }, 'copy')

    const rows = (await confirmedRowsTable.toArray()).map((row) => row.data as ConfirmedRow)
    expect(rows.map((row) => row.screen).sort()).toEqual(['overview', 'spending'])
    expect(new Set(rows.map((row) => row.rowId)).size).toBe(1)
  })
})

describe('rows confirmed before their file said where the numbers were', () => {
  beforeEach(async () => { await wipeAllData() })

  it('take their date and value back out of the observations', async () => {
    const id = await addConfirmedRow('finances', 'movements')
    await updateConfirmedRow(id, 'observations', JSON.stringify({ Data: '01/04/2025', Valor: '2100.00' }))

    expect(await fillFromObservations({}, { date: 'Data', value: 'Valor' })).toMatchObject({ filled: 1 })
    expect(await only()).toMatchObject({ date: Date.UTC(2025, 3, 1), value: 2100 })
  })

  it('leave a row that already has them alone, so it can be run twice', async () => {
    const id = await addConfirmedRow('finances', 'movements')
    await updateConfirmedRow(id, 'observations', JSON.stringify({ Data: '01/04/2025', Valor: '2100.00' }))
    await updateConfirmedRow(id, 'value', '-5')

    await fillFromObservations({}, { date: 'Data', value: 'Valor' })

    expect((await only()).value).toBe(-5)
    expect(await fillFromObservations({}, { date: 'Data', value: 'Valor' })).toMatchObject({ filled: 0, untouched: 1 })
  })

  it('touch only the table they were pointed at', async () => {
    const spending = await addConfirmedRow('finances', 'spending')
    await updateConfirmedRow(spending, 'observations', JSON.stringify({ Valor: '10' }))
    const movements = await addConfirmedRow('finances', 'movements')
    await updateConfirmedRow(movements, 'observations', JSON.stringify({ Valor: '20' }))

    await fillFromObservations({ screen: 'movements' }, { value: 'Valor' })

    const rows = (await confirmedRowsTable.toArray()).map((row) => row.data as ConfirmedRow)
    expect(rows.find((row) => row.screen === 'movements')!.value).toBe(20)
    expect(rows.find((row) => row.screen === 'spending')!.value).toBeUndefined()
  })
})
