import { describe, expect, it } from 'vitest'
import { isDuplicateOfStored, markDuplicateSourceRows, originalValues } from './source-row-marks'
import type { Entry, IngestionRow, IngestionSource } from './types'

const source = { originalFilename: 'nubank.csv', sourceFingerprint: 'f', importedAt: 1, rawCsv: '', originalColumns: ['date', 'title', 'amount'], supplementalColumns: ['quantity'], rowCount: 2, status: 'draftSource' } satisfies IngestionSource

function storedRow(rawValues: Record<string, string>): IngestionRow {
  return { sourceId: 9, sourceRowIndex: 0, sourceRowFingerprint: 'x', rawValues, mappedValues: {}, labels: {}, status: 'unlabelled', validationErrors: [] }
}

describe('what counts as an already-known row', () => {
  it('ignores columns the ingestion centre added, blank or not', () => {
    const values = originalValues({ date: '2026-01-02', title: 'Coffee', amount: '12.50', quantity: '' }, source.originalColumns)

    expect(values).toEqual({ date: '2026-01-02', title: 'coffee', amount: '12.50' })
  })

  it('needs every shared field to agree, not just some', () => {
    const candidate = { date: '2026-01-02', title: 'coffee', amount: '12.50' }

    expect(isDuplicateOfStored(candidate, [{ date: '2026-01-02', title: 'coffee', amount: '12.50' }])).toBe(true)
    expect(isDuplicateOfStored(candidate, [{ date: '2026-01-02', title: 'coffee', amount: '99' }])).toBe(false)
  })

  it('matches a stored row that simply lacks one of the columns', () => {
    expect(isDuplicateOfStored({ date: '2026-01-02', title: 'coffee', amount: '12.50' }, [{ date: '2026-01-02', amount: '12.50' }])).toBe(true)
  })

  it('refuses to call one shared column an identity', () => {
    expect(isDuplicateOfStored({ date: '2026-01-02', title: 'coffee' }, [{ date: '2026-01-02' }])).toBe(false)
  })
})

describe('marking a file against everything stored', () => {
  const fileRows = [
    { date: '2026-01-02', title: 'Coffee', amount: '12.50', quantity: '' },
    { date: '2026-01-03', title: 'Market', amount: '80', quantity: '' },
  ]

  it('marks the rows that already exist, in the worklist or in a finance table', () => {
    const marks = markDuplicateSourceRows(source, fileRows, [storedRow({ date: '2026-01-02', title: 'Coffee', amount: '12.50' })], [])

    expect(marks).toEqual({ '0': 'duplicate' })
  })

  it('sees a row that reached a finance table, not only one still queued', () => {
    const entry = { tableId: 1, deleted: false, date: '2026-01-03', title: 'Market', amount: '80' } as unknown as Entry

    expect(markDuplicateSourceRows(source, fileRows, [], [entry])).toEqual({ '1': 'duplicate' })
  })

  it('keeps a decision to eliminate, and clears a stale duplicate mark', () => {
    const marks = markDuplicateSourceRows(source, fileRows, [], [], { '0': 'eliminate', '1': 'duplicate' })

    expect(marks).toEqual({ '0': 'eliminate' })
  })
})
