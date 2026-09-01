import { describe, expect, it } from 'vitest'
import { coerceValue, exportCsv, parseCsv } from './csv'
import type { TableSchema } from './table-schema'

interface Row {
  date: number
  category: string
  amount: number
  note: string
}

const schema: TableSchema<Row> = [
  { key: 'date', labelKey: 'x:date', type: 'date' },
  { key: 'category', labelKey: 'x:category', type: 'select', options: ['Groceries', 'Bills'] },
  { key: 'amount', labelKey: 'x:amount', type: 'number' },
  { key: 'note', labelKey: 'x:note', type: 'text' },
]

describe('csv', () => {
  it('round-trips rows through export then import', () => {
    const rows: Row[] = [
      { date: Date.parse('2026-01-15'), category: 'Groceries', amount: 42.5, note: 'weekly shop' },
      { date: Date.parse('2026-02-01'), category: 'Bills', amount: 100, note: 'internet' },
    ]

    const csv = exportCsv(rows, schema)
    const { valid, errors } = parseCsv<Row>(csv, schema)

    expect(errors).toHaveLength(0)
    expect(valid).toEqual(rows)
  })

  it('collects per-row errors and excludes those rows from valid', () => {
    const csv = [
      'date,category,amount,note',
      '2026-01-15,Groceries,42.5,ok',
      'not-a-date,Groceries,10,bad date',
      '2026-01-16,NotAllowed,10,bad category',
      '2026-01-17,Bills,not-a-number,bad amount',
    ].join('\n')

    const { valid, errors } = parseCsv<Row>(csv, schema)

    expect(valid).toHaveLength(1)
    expect(errors).toHaveLength(3)
    expect(errors.map((e) => e.rowIndex)).toEqual([1, 2, 3])
  })

  describe('combobox columns', () => {
    const openSchema: TableSchema<Row> = [
      { key: 'date', labelKey: 'x:date', type: 'date' },
      { key: 'category', labelKey: 'x:category', type: 'combobox', options: ['Groceries', 'Bills'] },
      { key: 'amount', labelKey: 'x:amount', type: 'number' },
      { key: 'note', labelKey: 'x:note', type: 'text' },
    ]

    it('accepts a value outside the suggested options', () => {
      const result = coerceValue(openSchema[1], 'PIX Recebido')
      expect(result).toEqual({ ok: true, value: 'PIX Recebido' })
    })

    it('still rejects an empty value', () => {
      expect(coerceValue(openSchema[1], '   ').ok).toBe(false)
    })

    it('imports rows whose category was never seen before', () => {
      const csv = ['date,category,amount,note', '2026-01-15,Brand New Category,42.5,ok'].join('\n')

      const { valid, errors } = parseCsv<Row>(csv, openSchema)

      expect(errors).toHaveLength(0)
      expect(valid[0].category).toBe('Brand New Category')
    })

    it('a select column with the same options still rejects an unlisted value', () => {
      expect(coerceValue(schema[1], 'Brand New Category').ok).toBe(false)
    })
  })
})
