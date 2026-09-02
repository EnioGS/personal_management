import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { DEFAULT_INGESTION_GUIDE, INGESTION_GUIDE_KEY } from '@/lib/ingestion-guide'
import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { categoriesTable, ingestionRowsTable, ingestionSourcesTable, tableDefsTable } from '@/lib/model/model-db'
import type { Category, IngestionRow } from '@/lib/model/types'
import { listIngestionDatasetsTool, readIngestionGuideTool, readIngestionProvenanceTool, readIngestionTableTool, updateIngestionLabelsTool } from './ingestion-tools'

const context = { attachments: [] } as never

async function seedRow(): Promise<{ rowId: number; tableId: number }> {
  const tableId = await tableDefsTable.add({ createdAt: 1, data: { name: 'Nubank', kind: 'bankLedger' } })
  const sourceId = await ingestionSourcesTable.add({ createdAt: 1, data: { originalFilename: 'nubank.csv', sourceFingerprint: 'f', importedAt: 1, rawCsv: '', originalColumns: [], supplementalColumns: [], rowCount: 1, status: 'staged' } })
  const rowId = await ingestionRowsTable.add({
    createdAt: 2,
    data: { sourceId, sourceRowIndex: 0, sourceRowFingerprint: 'r0', rawValues: { description: 'Transferência recebida pelo Pix' }, mappedValues: { date: '1', amount: '10', description: 'Pix', direction: 'in', rawCategory: 'Pix' }, labels: {}, status: 'unlabelled', validationErrors: [] } satisfies IngestionRow,
  })
  return { rowId, tableId }
}

describe('ingestion tools', () => {
  beforeEach(async () => { await wipeAllData() })

  it('labels a row by value names and creates the category that was named', async () => {
    const { rowId, tableId } = await seedRow()

    const result = await updateIngestionLabelsTool.execute({ updates: [{ rowId, financeDestination: 'spending', flowRole: 'outflow', settlementChannel: 'checkingAccount', spendingTreatment: 'expense', recurrence: 'oneOff', category: 'Mercado', destinationTableId: tableId }] }, context)

    expect(JSON.parse(result)[0]).toMatchObject({ rowId, status: 'ready', errors: [] })
    expect((await categoriesTable.toArray()).map((row) => (row.data as Category).name)).toEqual(['Mercado'])
    const stored = (await ingestionRowsTable.get(rowId))!.data as IngestionRow
    expect(stored.labels).toMatchObject({ financeDestination: 'spending', flowRole: 'outflow' })
  })

  it('reuses an existing category rather than creating a second spelling of it', async () => {
    const { rowId, tableId } = await seedRow()
    const categoryId = await categoriesTable.add({ createdAt: 1, data: { name: 'Mercado' } })

    await updateIngestionLabelsTool.execute({ updates: [{ rowId, financeDestination: 'spending', flowRole: 'outflow', settlementChannel: 'checkingAccount', spendingTreatment: 'expense', recurrence: 'oneOff', category: 'mercado', destinationTableId: tableId }] }, context)

    expect(await categoriesTable.count()).toBe(1)
    expect(((await ingestionRowsTable.get(rowId))!.data as IngestionRow).labels.categoryId).toBe(categoryId)
  })

  it('reports what is still missing instead of marking an incomplete row ready', async () => {
    const { rowId, tableId } = await seedRow()

    const result = await updateIngestionLabelsTool.execute({ updates: [{ rowId, financeDestination: 'spending', flowRole: 'outflow', destinationTableId: tableId }] }, context)

    expect(JSON.parse(result)[0].status).toBe('invalid')
    expect(JSON.parse(result)[0].errors).toContain('Choose a settlement channel.')
  })

  it('returns the raw values and original filename behind a row', async () => {
    const { rowId } = await seedRow()

    const provenance = JSON.parse(await readIngestionProvenanceTool.execute({ rowId }, context))

    expect(provenance.sourceFilename).toBe('nubank.csv')
    expect(provenance.row.rawValues.description).toContain('Pix')
  })

  it('serves the stored guide when the user has edited it, and the default otherwise', async () => {
    expect(await readIngestionGuideTool.execute({}, context)).toBe(DEFAULT_INGESTION_GUIDE)

    await assistantPromptsTable.add({ createdAt: 1, data: { key: INGESTION_GUIDE_KEY, content: 'Label everything as investments.' } })

    expect(await readIngestionGuideTool.execute({}, context)).toBe('Label everything as investments.')
  })
})

describe('what the dataset listing tells the model', () => {
  beforeEach(async () => { await wipeAllData() })

  it('counts the rows a source actually has, never a stale stored rowCount', async () => {
    const sourceId = await ingestionSourcesTable.add({ createdAt: 1, data: { originalFilename: 'Existing data migration', sourceFingerprint: 'legacy', importedAt: 1, rawCsv: '', originalColumns: [], supplementalColumns: [], rowCount: 0, status: 'staged', legacy: true } })
    await ingestionRowsTable.bulkAdd([0, 1, 2].map((index) => ({ createdAt: 2, data: { sourceId, sourceRowIndex: index, sourceRowFingerprint: `r${index}`, rawValues: {}, mappedValues: {}, labels: {}, status: 'unlabelled', validationErrors: [] } satisfies IngestionRow })))

    const listed = JSON.parse(await listIngestionDatasetsTool.execute({}, context))

    expect(listed.unlabelled).toEqual({ count: 3, ready: 0 })
    expect(listed.sources[0].rows).toMatchObject({ total: 3, unlabelled: 3, ready: 0 })
  })

  it('never puts the uploaded file itself into the conversation', async () => {
    const rawCsv = 'date,amount\n2026-01-01,10\n'.repeat(500)
    await ingestionSourcesTable.add({ createdAt: 1, data: { originalFilename: 'nubank.csv', sourceFingerprint: 'f', importedAt: 1, rawCsv, originalColumns: ['date', 'amount'], supplementalColumns: [], rowCount: 500, status: 'mapped' } })

    const listed = await listIngestionDatasetsTool.execute({}, context)

    expect(listed).not.toContain('2026-01-01')
    expect(JSON.parse(listed).sources[0]).toMatchObject({ originalFilename: 'nubank.csv', rawCsvLength: rawCsv.length })
  })

  it('reads a page of the worklist and says whether more remain', async () => {
    const sourceId = await ingestionSourcesTable.add({ createdAt: 1, data: { originalFilename: 'legacy', sourceFingerprint: 'legacy', importedAt: 1, rawCsv: '', originalColumns: [], supplementalColumns: [], rowCount: 0, status: 'staged', legacy: true } })
    await ingestionRowsTable.bulkAdd([0, 1, 2].map((index) => ({ createdAt: 2, data: { sourceId, sourceRowIndex: index, sourceRowFingerprint: `r${index}`, rawValues: { description: `Row ${index}` }, mappedValues: {}, labels: {}, status: 'unlabelled', validationErrors: [] } satisfies IngestionRow })))

    const page = JSON.parse(await readIngestionTableTool.execute({ limit: 2 }, context))

    expect(page).toMatchObject({ total: 3, offset: 0, returned: 2, hasMore: true })
    expect(page.rows[0].rawValues.description).toBe('Row 0')
  })
})
