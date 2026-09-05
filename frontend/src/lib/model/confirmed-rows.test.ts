import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { addConfirmedRow, fillFromObservations, placeConfirmedRow, reviseConfirmedRows, setConfirmedMeaning, updateConfirmedRow } from './confirmed-rows'
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

describe('revising confirmed rows in bulk', () => {
  beforeEach(async () => { await wipeAllData() })

  it('adds the corrected row and marks the old one, both keeping the one id', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    await setConfirmedMeaning(id, { category: 'mercado' })
    const { rowId } = await only()

    expect(await reviseConfirmedRows([id], { account: 'Nubank - Main account' })).toMatchObject({ revised: 1 })

    const rows = (await confirmedRowsTable.toArray()).map((row) => row.data as ConfirmedRow)
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.rowId))).toEqual(new Set([rowId]))
    const corrected = rows.find((row) => !row.markedForElimination)!
    expect(corrected).toMatchObject({ account: 'Nubank - Main account', category: 'mercado' })
    expect(rows.find((row) => row.markedForElimination)!.account).toBeUndefined()
  })

  it('leaves a row that is already marked alone rather than superseding it twice', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    await reviseConfirmedRows([id], { account: 'Nubank - Main account' })
    const marked = (await confirmedRowsTable.toArray()).find((row) => (row.data as ConfirmedRow).markedForElimination)!

    expect(await reviseConfirmedRows([marked.id], { account: 'Another' })).toMatchObject({ revised: 0, skipped: 1 })
    expect(await confirmedRowsTable.count()).toBe(2)
  })

  it('refuses a revision that changes nothing', async () => {
    const id = await addConfirmedRow('finances', 'spending')

    await expect(reviseConfirmedRows([id], {})).rejects.toThrow(/change something/)
  })
})

describe('clearing a label rather than changing it', () => {
  beforeEach(async () => { await wipeAllData() })

  it('drops the card from the corrected row when the revision says null', async () => {
    const id = await addConfirmedRow('finances', 'movements')
    await reviseConfirmedRows([id], { card: 'Cartão principal', account: 'Conta principal' })
    const carrying = (await confirmedRowsTable.toArray()).find((row) => !(row.data as ConfirmedRow).markedForElimination)!

    await reviseConfirmedRows([carrying.id], { card: null })

    const current = (await confirmedRowsTable.toArray())
      .map((row) => row.data as ConfirmedRow)
      .filter((row) => !row.markedForElimination)
    expect(current).toHaveLength(1)
    expect(current[0].card).toBeUndefined()
    // What it corrected is still there, saying what the row used to claim.
    expect((await confirmedRowsTable.toArray()).some((row) => (row.data as ConfirmedRow).card === 'Cartão principal')).toBe(true)
  })

  it('leaves every field it was not given alone', async () => {
    const id = await addConfirmedRow('finances', 'spending')
    await updateConfirmedRow(id, 'value', '-284,90')
    await updateConfirmedRow(id, 'date', '02/08/2026')

    await reviseConfirmedRows([id], { account: 'Nubank - Main account' })

    const corrected = (await confirmedRowsTable.toArray())
      .map((row) => row.data as ConfirmedRow)
      .find((row) => !row.markedForElimination)!
    expect(corrected).toMatchObject({ value: -284.9, date: Date.UTC(2026, 7, 2), account: 'Nubank - Main account' })
  })
})
