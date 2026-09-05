import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { confirmedRowsTable, sourceFilesTable, sourceRowsTable } from './model-db'
import type { LabelCatalogue } from './label-catalogue'
import type { ConfirmedRow, SourceFile, SourceRow } from './types'
import {
  addSourceRow,
  assignSourceColumns,
  confirmSourceRows,
  createSourceFile,
  filenameSimilarity,
  flagCrossFileDuplicates,
  observationsFor,
  planConfirmation,
  retireEmptySourceFiles,
  rowSignature,
  setSignConvention,
  updateSourceValue,
} from './source-files'

const catalogue: LabelCatalogue = {
  sections: [{ id: 'finances', label: 'Finanças' }],
  screens: [
    { id: 'overview', sectionId: 'finances', label: 'Movimentações' },
    { id: 'spending', sectionId: 'finances', label: 'Gastos' },
  ],
  accounts: [{ id: 'Banco A', label: 'Banco A' }],
  cards: [{ id: 'Cartão X', label: 'Cartão X' }],
}

const BANK_CSV = [
  'Data,Descrição,Valor,Tipo',
  '01/08/2026,SALARIO,"3.500,00",C',
  '02/08/2026,MERCADO SAO JORGE,"-284,90",D',
].join('\n')

async function rowsOf(sourceId: number): Promise<{ id: number; row: SourceRow }[]> {
  return (await sourceRowsTable.toArray())
    .map((stored) => ({ id: stored.id, row: stored.data as SourceRow }))
    .filter((entry) => entry.row.sourceId === sourceId)
}

async function label(id: number, labels: SourceRow['labels']) {
  const stored = await sourceRowsTable.get(id)
  await sourceRowsTable.update(id, { data: { ...(stored!.data as SourceRow), labels } })
}

describe('a file arriving', () => {
  beforeEach(async () => { await wipeAllData() })

  it('becomes its own table: every column the file wrote, and where it came from', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    const file = (await sourceFilesTable.get(sourceId))!.data as SourceFile
    const rows = await rowsOf(sourceId)

    expect(file.originalColumns).toEqual(['Data', 'Descrição', 'Valor', 'Tipo'])
    expect(rows).toHaveLength(2)
    expect(rows[0].row.values).toMatchObject({ source_filename: 'banco-agosto.csv', Descrição: 'SALARIO' })
    // Nothing starts labelled: the row says what the file said and no more.
    expect(rows[0].row.labels).toEqual({})
  })

  it('gives two identical rows different ids, because a bank may report the same charge twice', async () => {
    const sourceId = await createSourceFile('repeat.csv', 'Data,Valor\n01/08/2026,10\n01/08/2026,10')
    const [first, second] = await rowsOf(sourceId)

    expect(first.row.rowId).not.toBe(second.row.rowId)
  })

  it('refuses to assign anything that is not one of the file\'s own columns', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)

    await expect(assignSourceColumns(sourceId, { source_filename: 'date' })).rejects.toThrow(/own columns/)
    await expect(assignSourceColumns(sourceId, { category: 'date' })).rejects.toThrow(/own columns/)
  })

  it('moves a canonical field rather than duplicating it when it is assigned twice', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await assignSourceColumns(sourceId, { Data: 'date' })
    const file = await assignSourceColumns(sourceId, { Descrição: 'date' })

    expect(file.assignments).toEqual({ Descrição: 'date' })
  })
})

describe('confirming', () => {
  beforeEach(async () => { await wipeAllData() })

  async function readyFile() {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await assignSourceColumns(sourceId, { Data: 'date', Valor: 'value' })
    return sourceId
  }

  it('writes one copy per (section, screen) pair, all sharing the row id, and empties the file', async () => {
    const sourceId = await readyFile()
    const rows = await rowsOf(sourceId)
    await label(rows[1].id, { sections: ['finances'], screens: ['overview', 'spending'], category: 'mercado', subcategory: 'outros', account: 'Banco A', card: 'Cartão X' })

    const result = await confirmSourceRows(sourceId, catalogue)

    expect(result).toMatchObject({ confirmed: 1, copies: 2, leftBehind: 1 })
    const confirmed = (await confirmedRowsTable.toArray()).map((stored) => stored.data as ConfirmedRow)
    expect(confirmed.map((row) => row.screen).sort()).toEqual(['overview', 'spending'])
    expect(new Set(confirmed.map((row) => row.rowId)).size).toBe(1)
    expect(await rowsOf(sourceId)).toHaveLength(1)
  })

  it('leaves a row nobody has placed exactly where it is', async () => {
    const sourceId = await readyFile()

    const plan = await planConfirmation(sourceId, catalogue)
    expect(plan.ready).toHaveLength(0)
    expect(plan.incomplete).toHaveLength(2)

    expect(await confirmSourceRows(sourceId, catalogue)).toMatchObject({ confirmed: 0, leftBehind: 2 })
    expect(await rowsOf(sourceId)).toHaveLength(2)
  })

  it('condenses every unassigned column into the observations, so nothing the file said is lost', async () => {
    const sourceId = await readyFile()
    const rows = await rowsOf(sourceId)
    await label(rows[1].id, { sections: ['finances'], screens: ['spending'], category: 'mercado', subcategory: 'outros', account: 'Banco A', card: 'Cartão X' })

    await confirmSourceRows(sourceId, catalogue)

    const confirmed = (await confirmedRowsTable.toArray())[0].data as ConfirmedRow
    // The filename is in here and nowhere else: a confirmed row has no column repeating it.
    expect(JSON.parse(confirmed.observations)).toEqual({
      source_filename: 'banco-agosto.csv',
      Descrição: 'MERCADO SAO JORGE',
      Tipo: 'D',
    })
    expect('sourceFilename' in confirmed).toBe(false)
    expect(confirmed.value).toBe(-284.9)
    expect(confirmed.date).toBe(Date.UTC(2026, 7, 2))
  })

  it('rewrites the amount column itself, and keeps what the file wrote', async () => {
    const sourceId = await readyFile()
    await setSignConvention(sourceId, { kind: 'invertAll' })
    const rows = await rowsOf(sourceId)
    await label(rows[0].id, { sections: ['finances'], screens: ['overview'], category: 'salário', subcategory: 'outros', account: 'Banco A', card: 'Cartão X' })

    // The rewrite lands in the data, so the table itself shows what will be confirmed.
    expect((await rowsOf(sourceId))[0].row).toMatchObject({ values: { Valor: '-3500' }, importedValue: '3.500,00' })

    await confirmSourceRows(sourceId, catalogue)

    const confirmed = (await confirmedRowsTable.toArray())[0].data as ConfirmedRow
    expect(confirmed.value).toBe(-3500)
    expect(JSON.parse(confirmed.observations).value_as_imported).toBe('3.500,00')
  })

  it('puts the amounts back when the convention is set to what the file wrote', async () => {
    const sourceId = await readyFile()
    await setSignConvention(sourceId, { kind: 'invertAll' })
    await setSignConvention(sourceId, { kind: 'asImported' })

    expect((await rowsOf(sourceId))[0].row).toMatchObject({ values: { Valor: '3.500,00' } })
    expect((await rowsOf(sourceId))[0].row.importedValue).toBeUndefined()
  })

  it('reads direction from another column when that is where the file put it', async () => {
    const sourceId = await readyFile()
    await setSignConvention(sourceId, { kind: 'invertWhen', column: 'Tipo', values: ['D'] })
    expect((await rowsOf(sourceId)).map((entry) => entry.row.values.Valor)).toEqual(['3500', '-284.9'])
    for (const { id } of await rowsOf(sourceId)) {
      await label(id, { sections: ['finances'], screens: ['overview'], category: 'outros', subcategory: 'outros', account: 'Banco A', card: 'Cartão X' })
    }

    await confirmSourceRows(sourceId, catalogue)

    const amounts = (await confirmedRowsTable.toArray()).map((stored) => (stored.data as ConfirmedRow).value)
    expect(amounts.sort((a, b) => a! - b!)).toEqual([-284.9, 3500])
  })

  it('only discards what is marked, and only retires the file, when explicitly told to', async () => {
    const sourceId = await readyFile()
    const rows = await rowsOf(sourceId)
    await label(rows[0].id, { sections: ['finances'], screens: ['overview'], category: 'salário', subcategory: 'outros', account: 'Banco A', card: 'Cartão X' })
    await sourceRowsTable.update(rows[1].id, { data: { ...rows[1].row, markedForElimination: true } })

    expect(await confirmSourceRows(sourceId, catalogue)).toMatchObject({ confirmed: 1, discarded: 0, leftBehind: 1, removedFile: false })
    expect(await confirmSourceRows(sourceId, catalogue, { discardMarked: true })).toMatchObject({ discarded: 1, removedFile: true })
    expect(await sourceFilesTable.count()).toBe(0)
  })
})

describe('text that is not a .csv', () => {
  beforeEach(async () => { await wipeAllData() })

  it('reads a markdown pipe table as the table it is', async () => {
    const sourceId = await createSourceFile('extrato.md', [
      '| Data | Valor |',
      '| --- | --- |',
      '| 01/08/2026 | -10,00 |',
    ].join('\n'))

    const file = (await sourceFilesTable.get(sourceId))!.data as SourceFile
    expect(file.originalColumns).toEqual(['Data', 'Valor'])
    expect((await rowsOf(sourceId))[0].row.values).toMatchObject({ Data: '01/08/2026', Valor: '-10,00' })
  })

  it('detects the separator rather than demanding a comma', async () => {
    const sourceId = await createSourceFile('extrato.txt', 'Data;Valor\n01/08/2026;-10,00')

    expect(((await sourceFilesTable.get(sourceId))!.data as SourceFile).originalColumns).toEqual(['Data', 'Valor'])
  })

  it('refuses text with nothing that reads as a header', async () => {
    await expect(createSourceFile('notes.md', '   ')).rejects.toThrow(/header row/)
  })
})

describe('a file with nothing left in it', () => {
  beforeEach(async () => { await wipeAllData() })

  it('is retired once its last row has been confirmed', async () => {
    const sourceId = await createSourceFile('one-row.csv', 'Data,Valor\n01/08/2026,-10')
    await assignSourceColumns(sourceId, { Data: 'date', Valor: 'value' })
    const [only] = await rowsOf(sourceId)
    await label(only.id, { sections: ['finances'], screens: ['overview'], category: 'outros', subcategory: 'outros', account: 'Banco A', card: 'Cartão X' })

    expect(await confirmSourceRows(sourceId, catalogue)).toMatchObject({ confirmed: 1, removedFile: true })
    expect(await sourceFilesTable.count()).toBe(0)
  })
})

describe('what counts as a duplicate', () => {
  beforeEach(async () => { await wipeAllData() })

  it('is never two identical rows inside one file — those are two real transactions', async () => {
    const sourceId = await createSourceFile('repeat.csv', 'Data,Valor\n01/08/2026,10\n01/08/2026,10')
    await flagCrossFileDuplicates(sourceId)

    expect((await rowsOf(sourceId)).map((entry) => entry.row.duplicateOf)).toEqual([undefined, undefined])
  })

  it('is a row that matches one from another file, flagged and nothing more', async () => {
    const august = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await assignSourceColumns(august, { Data: 'date', Valor: 'value' })
    const september = await createSourceFile('banco-setembro.csv', BANK_CSV)
    await assignSourceColumns(september, { Data: 'date', Valor: 'value' })

    const flagged = (await rowsOf(september)).filter((entry) => entry.row.duplicateOf)
    expect(flagged).toHaveLength(2)
    // Advisory: the rows are still there, and still confirmable.
    expect(flagged.every((entry) => !entry.row.markedForElimination)).toBe(true)
  })

  it('compares everything the row carries, not only the day and the money', () => {
    const assignments = { Data: 'date', Valor: 'value' } as const
    const row = { Data: '01/08/2026', Valor: '-10,00', Descrição: 'MERCADO' }

    // Two transactions of the same size on the same day are not the same transaction.
    expect(rowSignature(row, assignments)).not.toBe(rowSignature({ ...row, Descrição: 'PADARIA' }, assignments))
    // The same row written differently still is: dates, money, spacing and case are how
    // the same thing gets written twice.
    expect(rowSignature(row, assignments)).toBe(rowSignature({ Data: '2026-08-01', Valor: '10.00', Descrição: '  mercado ' }, assignments))
  })

  it('flags a file whose name is nearly one already imported, against the shorter name', async () => {
    const first = await createSourceFile('Nubank_2026-09-08.csv', BANK_CSV)
    const second = await createSourceFile('Nubank_2026-09-08 (1).csv', BANK_CSV)

    expect(filenameSimilarity('Nubank_2026-09-08 (1).csv', 'Nubank_2026-09-08.csv')).toBeGreaterThan(0.8)
    expect(((await sourceFilesTable.get(second))!.data as SourceFile).looksLikeSourceId).toBe(first)
    expect(((await sourceFilesTable.get(first))!.data as SourceFile).looksLikeSourceId).toBeUndefined()
  })
})

describe('observationsFor', () => {
  it('keeps everything no column was assigned to, the filename included, and never an empty value', () => {
    const file = { assignments: { Data: 'date' } } as unknown as SourceFile
    const row = { values: { source_filename: 'banco.csv', Data: '01/08/2026', Descrição: 'MERCADO', Tipo: '' } } as unknown as SourceRow

    expect(JSON.parse(observationsFor(row, file))).toEqual({ source_filename: 'banco.csv', Descrição: 'MERCADO' })
  })
})

describe('a line added by hand, and a cell corrected', () => {
  beforeEach(async () => { await wipeAllData() })

  it('adds an empty row carrying the file\'s columns and its own id', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    const before = await rowsOf(sourceId)
    await addSourceRow(sourceId)
    const after = await rowsOf(sourceId)

    expect(after).toHaveLength(before.length + 1)
    const added = after.at(-1)!.row
    expect(added.values).toEqual({ source_filename: 'banco-agosto.csv', Data: '', Descrição: '', Valor: '', Tipo: '' })
    expect(after.map((entry) => entry.row.rowId)).toHaveLength(new Set(after.map((entry) => entry.row.rowId)).size)
  })

  it('re-applies the file\'s sign convention to an amount typed by hand', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await assignSourceColumns(sourceId, { Valor: 'value' })
    await setSignConvention(sourceId, { kind: 'invertAll' })
    const [first] = await rowsOf(sourceId)

    await updateSourceValue(first.id, 'Valor', '250,00')

    expect((await rowsOf(sourceId))[0].row).toMatchObject({ values: { Valor: '-250' }, importedValue: '250,00' })
  })

  it('refuses to rewrite where a row came from', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    const [first] = await rowsOf(sourceId)

    await expect(updateSourceValue(first.id, 'source_filename', 'other.csv')).rejects.toThrow(/not editable/)
  })
})

describe('account and card, as labels', () => {
  beforeEach(async () => { await wipeAllData() })

  it('travel with the row into the table it is confirmed to', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await assignSourceColumns(sourceId, { Data: 'date', Valor: 'value' })
    const [first] = await rowsOf(sourceId)
    await label(first.id, {
      sections: ['finances'], screens: ['overview'], category: 'outros', subcategory: 'outros',
      account: 'Banco A', card: 'Cartão X',
    })

    await confirmSourceRows(sourceId, catalogue)

    expect((await confirmedRowsTable.toArray())[0].data).toMatchObject({ account: 'Banco A', card: 'Cartão X' })
  })

  it('hold a row back when it names no account, and let one through with no card', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await assignSourceColumns(sourceId, { Data: 'date', Valor: 'value' })
    const [first, second] = await rowsOf(sourceId)
    await label(first.id, { sections: ['finances'], screens: ['overview'], category: 'outros', subcategory: 'outros' })
    // No card, and that is a complete answer: this row never touched one.
    await label(second.id, { sections: ['finances'], screens: ['overview'], category: 'outros', subcategory: 'outros', account: 'Banco A' })

    const plan = await planConfirmation(sourceId, catalogue)
    expect(plan.incomplete).toEqual([first.id])
    expect(plan.ready).toEqual([second.id])
  })
})

describe('files with nothing in them', () => {
  beforeEach(async () => { await wipeAllData() })

  it('are refused at the door rather than created and cleaned up later', async () => {
    await expect(createSourceFile('header-only.csv', 'Data,Valor')).rejects.toThrow(/no rows under it/)
    expect(await sourceFilesTable.count()).toBe(0)
  })

  it('are swept when the screen opens, for anything an older build left behind', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await sourceRowsTable.bulkDelete((await rowsOf(sourceId)).map((entry) => entry.id))

    expect(await retireEmptySourceFiles()).toBe(1)
    expect(await sourceFilesTable.count()).toBe(0)
  })

  it('leaves a file that still holds rows alone', async () => {
    await createSourceFile('banco-agosto.csv', BANK_CSV)

    expect(await retireEmptySourceFiles()).toBe(0)
    expect(await sourceFilesTable.count()).toBe(1)
  })
})

describe('scanning many files at once', () => {
  beforeEach(async () => { await wipeAllData() })

  it('flags across files in one pass, exactly as scanning them one by one would', async () => {
    const august = await createSourceFile('banco-agosto.csv', BANK_CSV, { scanDuplicates: false })
    const september = await createSourceFile('banco-setembro.csv', BANK_CSV, { scanDuplicates: false })
    await assignSourceColumns(august, { Data: 'date', Valor: 'value' })
    await assignSourceColumns(september, { Data: 'date', Valor: 'value' })

    // Nothing was scanned on the way in; one pass settles both files.
    await flagCrossFileDuplicates(august, september)

    expect((await rowsOf(september)).every((entry) => entry.row.duplicateOf)).toBe(true)
    expect((await rowsOf(august)).every((entry) => entry.row.duplicateOf)).toBe(true)
  })

  it('still compares a row only against other files, however many are scanned together', async () => {
    const repeated = await createSourceFile('repeat.csv', 'Data,Valor\n01/08/2026,10\n01/08/2026,10', { scanDuplicates: false })
    await assignSourceColumns(repeated, { Data: 'date', Valor: 'value' })

    await flagCrossFileDuplicates(repeated)

    expect((await rowsOf(repeated)).map((entry) => entry.row.duplicateOf)).toEqual([undefined, undefined])
  })
})

describe('text that separates its columns with something other than a comma', () => {
  beforeEach(async () => { await wipeAllData() })

  it('reads a table written the way a person writes one', async () => {
    const sourceId = await createSourceFile('resgate.txt', [
      'Date - Type - Asset - Value - Quantity',
      '04/02/2026 - resgate - Tesouro Selic 2029 - 1.234,56 - 1',
      '05/02/2026 - resgate - Tesouro IPCA 2035 - 2.000,00 - 2',
    ].join('\n'))

    const file = (await sourceFilesTable.get(sourceId))!.data as SourceFile
    expect(file.originalColumns).toEqual(['Date', 'Type', 'Asset', 'Value', 'Quantity'])
    expect((await rowsOf(sourceId))[0].row.values).toMatchObject({ Asset: 'Tesouro Selic 2029', Value: '1.234,56' })
  })

  it('takes the separator it is told, for a file whose values hold the one it uses', async () => {
    const sourceId = await createSourceFile('resgate.txt', [
      'Date;Asset;Value',
      '04/02/2026;Tesouro Selic 2029 - resgate;1.234,56',
    ].join('\n'), { delimiter: ';' })

    expect(((await sourceFilesTable.get(sourceId))!.data as SourceFile).originalColumns).toEqual(['Date', 'Asset', 'Value'])
    expect((await rowsOf(sourceId))[0].row.values.Asset).toBe('Tesouro Selic 2029 - resgate')
  })
})

describe('what a row claims before anyone has looked at it', () => {
  beforeEach(async () => { await wipeAllData() })

  it('is nothing: an imported row carries no category and no subcategory', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)

    expect((await rowsOf(sourceId)).every((entry) => Object.keys(entry.row.labels).length === 0)).toBe(true)
  })

  it('and a row confirmed without one arrives with it empty, not with a word nobody chose', async () => {
    const sourceId = await createSourceFile('banco-agosto.csv', BANK_CSV)
    await assignSourceColumns(sourceId, { Data: 'date', Valor: 'value' })
    const [first] = await rowsOf(sourceId)
    await label(first.id, { sections: ['finances'], screens: ['overview'], account: 'Banco A' })

    await confirmSourceRows(sourceId, catalogue)

    expect((await confirmedRowsTable.toArray())[0].data).toMatchObject({ category: '', subcategory: '' })
  })
})

describe('what makes two rows the same row', () => {
  beforeEach(async () => { await wipeAllData() })

  const august = [
    'Data,Descrição,Valor',
    '01/08/2026,MERCADO SAO JORGE,"-284,90"',
    '02/08/2026,PADARIA,"-284,90"',
  ].join('\n')

  it('is everything they say, so same-day same-amount rows are left alone', async () => {
    const first = await createSourceFile('banco-agosto.csv', august, { scanDuplicates: false })
    // A different file, same amounts and dates, different transactions entirely.
    const second = await createSourceFile('cartao-agosto.csv', [
      'Data,Descrição,Valor',
      '01/08/2026,POSTO IPIRANGA,"-284,90"',
      '02/08/2026,FARMACIA,"-284,90"',
    ].join('\n'), { scanDuplicates: false })
    await assignSourceColumns(first, { Data: 'date', Valor: 'value' })
    await assignSourceColumns(second, { Data: 'date', Valor: 'value' })

    await flagCrossFileDuplicates(first, second)

    expect((await rowsOf(second)).every((entry) => entry.row.duplicateOf === undefined)).toBe(true)
  })

  it('and the same rows in another file are still caught', async () => {
    const first = await createSourceFile('banco-agosto.csv', august, { scanDuplicates: false })
    const again = await createSourceFile('banco-agosto (1).csv', august, { scanDuplicates: false })
    await assignSourceColumns(first, { Data: 'date', Valor: 'value' })
    await assignSourceColumns(again, { Data: 'date', Valor: 'value' })

    await flagCrossFileDuplicates(first, again)

    expect((await rowsOf(again)).every((entry) => entry.row.duplicateOf)).toBe(true)
  })
})
