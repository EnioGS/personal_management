import { beforeEach, describe, expect, it } from 'vitest'
import {
  createIngestionSource,
  createSupplementalColumn,
  markSourceRows,
  parseIngestionCsv,
  planIngestionStaging,
  removeFinishedIngestionSource,
  saveIngestionMappings,
  stageIngestionSource,
  validateIngestionMappings,
} from './ingestion-source'
import { ingestionRowsTable, ingestionSourcesTable } from './model-db'
import { wipeAllData } from '@/lib/data-file'
import type { IngestionTargetField } from './types'

const RAW_CSV = 'Date,Description,Amount\n2026-01-01,Coffee,10\n2026-01-02,Market,20'
const SUPPLEMENTAL_FIELDS: IngestionTargetField[] = ['direction', 'rawCategory', 'asset', 'investmentType', 'investmentClass', 'quantity', 'price', 'note', 'destination']

describe('ingestion source staging', () => {
  beforeEach(async () => {
    await wipeAllData()
  })

  it('keeps original columns untouched while parsing raw values', () => {
    expect(parseIngestionCsv(RAW_CSV)).toEqual({
      columns: ['Date', 'Description', 'Amount'],
      rows: [
        { Date: '2026-01-01', Description: 'Coffee', Amount: '10' },
        { Date: '2026-01-02', Description: 'Market', Amount: '20' },
      ],
    })
  })

  it('requires mappings for every possible later table destination', () => {
    const validation = validateIngestionMappings(['Date'], [], [{ sourceId: 1, sourceColumn: 'Date', targetField: 'date' }])
    expect(validation.missingFields).toEqual(expect.arrayContaining(['amount', 'asset', 'investmentType']))
  })

  it('uses supplemental blank columns to make a sparse source structurally complete without changing the raw csv', async () => {
    const sourceId = await createIngestionSource('source.csv', RAW_CSV)
    for (const column of SUPPLEMENTAL_FIELDS) {
      await createSupplementalColumn(sourceId, column)
    }
    await saveIngestionMappings(sourceId, [
      { sourceId, sourceColumn: 'Date', targetField: 'date' },
      { sourceId, sourceColumn: 'Description', targetField: 'description' },
      { sourceId, sourceColumn: 'Amount', targetField: 'amount' },
      ...SUPPLEMENTAL_FIELDS.map((column) => ({
        sourceId,
        sourceColumn: column,
        targetField: column,
        isSupplemental: true,
      })),
    ])

    await expect(stageIngestionSource(sourceId)).resolves.toMatchObject({ staged: 2, duplicates: 0 })
    const source = (await ingestionSourcesTable.get(sourceId))!.data as { originalColumns: string[]; supplementalColumns: string[]; rawCsv: string }
    expect(source.originalColumns).toEqual(['Date', 'Description', 'Amount'])
    expect(source.supplementalColumns).toContain('asset')
    expect(source.rawCsv).toBe(RAW_CSV)
    expect((await ingestionRowsTable.toArray())[0].data).toMatchObject({ rawValues: { asset: '' }, mappedValues: { asset: '' } })
  })

  it('does not create duplicate staged rows when staging is retried', async () => {
    const sourceId = await createIngestionSource('source.csv', RAW_CSV)
    const source = (await ingestionSourcesTable.get(sourceId))!.data as { originalColumns: string[] }
    const missing = validateIngestionMappings(source.originalColumns, [], []).missingFields
    for (const field of missing) await createSupplementalColumn(sourceId, field)
    await saveIngestionMappings(
      sourceId,
      missing.map((field) => ({ sourceId, sourceColumn: field, targetField: field, isSupplemental: true })),
    )

    await stageIngestionSource(sourceId)
    await expect(stageIngestionSource(sourceId)).resolves.toMatchObject({ staged: 0, duplicates: 2 })
    expect(await ingestionRowsTable.count()).toBe(2)
  })
})

describe('removing a source file once everything in it is dealt with', () => {
  beforeEach(async () => { await wipeAllData() })

  async function sourceWithRows(statuses: string[]) {
    const sourceId = await ingestionSourcesTable.add({ createdAt: 1, data: { originalFilename: 'fatura.csv', sourceFingerprint: 'f', importedAt: 1, rawCsv: 'a\n1\n', originalColumns: ['a'], supplementalColumns: [], rowCount: statuses.length, status: 'staged' } })
    const ids: number[] = []
    for (const [index, status] of statuses.entries()) {
      ids.push(await ingestionRowsTable.add({ createdAt: 2, data: { sourceId, sourceRowIndex: index, sourceRowFingerprint: `r${index}`, rawValues: { description: `Row ${index}` }, mappedValues: {}, labels: {}, status, validationErrors: [] } }))
    }
    return { sourceId, ids }
  }

  it('counts a discarded duplicate as dealt with, since it can never reach the confirmed table', async () => {
    const { sourceId, ids } = await sourceWithRows(['promoted', 'discarded'])

    const result = await removeFinishedIngestionSource(sourceId)

    expect(result).toMatchObject({ originalFilename: 'fatura.csv', keptRows: 1, deletedRows: 1 })
    expect(await ingestionSourcesTable.get(sourceId)).toBeUndefined()
    expect(await ingestionRowsTable.get(ids[1])).toBeUndefined()
    expect((await ingestionRowsTable.get(ids[0]))!.data).toMatchObject({ status: 'promoted', sourceFilename: 'fatura.csv', rawValues: { description: 'Row 0' } })
  })

  it('refuses while any row is still waiting, and says how many', async () => {
    const { sourceId } = await sourceWithRows(['promoted', 'unlabelled', 'ready'])

    await expect(removeFinishedIngestionSource(sourceId)).rejects.toThrow(/still has 2 row\(s\) waiting/)
    expect(await ingestionSourcesTable.get(sourceId)).toBeDefined()
  })
})

describe('staging with the file marked up', () => {
  beforeEach(async () => { await wipeAllData() })

  async function markedSource() {
    const sourceId = await createIngestionSource('nubank.csv', RAW_CSV)
    const source = (await ingestionSourcesTable.get(sourceId))!.data as { originalColumns: string[]; supplementalColumns: string[] }
    for (const field of SUPPLEMENTAL_FIELDS) await createSupplementalColumn(sourceId, field)
    await saveIngestionMappings(sourceId, [
      { sourceId, sourceColumn: 'Date', targetField: 'date' },
      { sourceId, sourceColumn: 'Description', targetField: 'description' },
      { sourceId, sourceColumn: 'Amount', targetField: 'amount' },
      ...SUPPLEMENTAL_FIELDS.map((field) => ({ sourceId, sourceColumn: field, targetField: field })),
    ])
    void source
    return sourceId
  }

  it('reports what staging would do before anyone stages anything', async () => {
    const sourceId = await markedSource()
    await markSourceRows(sourceId, [0], 'duplicate')

    expect(await planIngestionStaging(sourceId)).toEqual({ ready: [1], duplicate: [0], eliminate: [], alreadyStaged: [] })
  })

  it('never stages a row marked for elimination', async () => {
    const sourceId = await markedSource()
    await markSourceRows(sourceId, [0], 'eliminate')

    const result = await stageIngestionSource(sourceId)

    expect(result).toMatchObject({ staged: 1, eliminated: 1 })
    expect((await ingestionRowsTable.toArray()).map((row) => (row.data as { sourceRowIndex: number }).sourceRowIndex)).toEqual([1])
  })

  it('leaves questionable rows in the file when only the ready ones are wanted', async () => {
    const sourceId = await markedSource()
    await markSourceRows(sourceId, [1], 'duplicate')

    const result = await stageIngestionSource(sourceId, { readyOnly: true })

    expect(result).toMatchObject({ staged: 1, skippedDuplicateMarks: 1 })
    expect((await planIngestionStaging(sourceId))).toMatchObject({ ready: [], duplicate: [1], alreadyStaged: [0] })
  })
})
