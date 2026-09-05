import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { deleteMarked, setMarked, toggleMark } from './marking'
import { confirmedRowsTable, sourceRowsTable } from './model-db'
import type { ConfirmedRow, SourceRow } from './types'

async function sourceRow(rowId: string) {
  return sourceRowsTable.add({ createdAt: 1, data: { sourceId: 1, rowId, values: {}, labels: {} } satisfies SourceRow })
}

async function confirmedRow(rowId: string) {
  return confirmedRowsTable.add({
    createdAt: 1,
    data: { rowId, section: 'finances', screen: 'overview', sourceFilename: 'x.csv', confirmedAt: 1, observations: '{}', category: 'outros', subcategory: 'outros' } satisfies ConfirmedRow,
  })
}

describe('marking for elimination', () => {
  beforeEach(async () => { await wipeAllData() })

  it('goes on and off with the same gesture, on source rows and confirmed rows alike', async () => {
    const source = await sourceRow('r1')
    const confirmed = await confirmedRow('r2')

    expect(await toggleMark('source', source)).toBe(true)
    expect(await toggleMark('confirmed', confirmed)).toBe(true)
    expect(await toggleMark('source', source)).toBe(false)

    expect((await sourceRowsTable.get(source))!.data).toMatchObject({ markedForElimination: false })
    expect((await confirmedRowsTable.get(confirmed))!.data).toMatchObject({ markedForElimination: true })
  })

  it('removes nothing by itself — a marked row is still there', async () => {
    const id = await sourceRow('r1')
    await setMarked('source', [id], true)

    expect(await sourceRowsTable.count()).toBe(1)
  })

  it('skips a row that is not there rather than failing the whole call', async () => {
    const id = await sourceRow('r1')

    expect(await setMarked('source', [id, 9999], true)).toBe(1)
  })
})

describe('deleting marked rows', () => {
  beforeEach(async () => { await wipeAllData() })

  it('takes the marked ones and leaves everything else, whatever it was asked to look at', async () => {
    const marked = await sourceRow('r1')
    const untouched = await sourceRow('r2')
    await setMarked('source', [marked], true)

    expect(await deleteMarked('source', [marked, untouched])).toBe(1)
    expect((await sourceRowsTable.toArray()).map((row) => (row.data as SourceRow).rowId)).toEqual(['r2'])
  })

  it('deletes nothing when nothing is marked', async () => {
    const id = await confirmedRow('r1')

    expect(await deleteMarked('confirmed', [id])).toBe(0)
    expect(await confirmedRowsTable.count()).toBe(1)
  })
})
