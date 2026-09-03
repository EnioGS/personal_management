import { describe, expect, it } from 'vitest'
import { groupRows, queryRows, type FieldResolver } from './row-query'

interface Row { description: string; amount: string; date: string; status: string }

const resolve: FieldResolver<Row> = (row, field) => (row as unknown as Record<string, unknown>)[field]

const rows: Row[] = [
  { description: 'Pagamento de fatura', amount: '2539.24', date: '18/08/2025', status: 'unlabelled' },
  { description: 'PAGAMENTO DE FATURA', amount: '1200', date: '2025-09-01', status: 'ready' },
  { description: 'Amazonprimebr', amount: '19.90', date: '02/01/2026', status: 'unlabelled' },
  { description: 'Transferência recebida pelo Pix', amount: '260', date: '20/08/2025', status: 'unlabelled' },
  { description: '', amount: '', date: '', status: 'invalid' },
]

describe('queryRows', () => {
  it('matches text without caring about case or accents', () => {
    expect(queryRows(rows, resolve, { filters: [{ field: 'description', op: 'contains', value: 'pagamento' }] }).matched).toBe(2)
    expect(queryRows(rows, resolve, { filters: [{ field: 'description', op: 'contains', value: 'transferencia' }] }).matched).toBe(1)
  })

  it('honours case when asked to', () => {
    const result = queryRows(rows, resolve, { filters: [{ field: 'description', op: 'contains', value: 'PAGAMENTO', caseSensitive: true }] })

    expect(result.matched).toBe(1)
  })

  it('combines filters with all or any', () => {
    const both = queryRows(rows, resolve, { filters: [{ field: 'description', op: 'contains', value: 'pagamento' }, { field: 'status', op: 'equals', value: 'ready' }] })
    const either = queryRows(rows, resolve, { match: 'any', filters: [{ field: 'description', op: 'contains', value: 'amazon' }, { field: 'status', op: 'equals', value: 'ready' }] })

    expect(both.matched).toBe(1)
    expect(either.matched).toBe(2)
  })

  it('compares numbers as numbers, and never lets a non-number slip through', () => {
    const above = queryRows(rows, resolve, { filters: [{ field: 'amount', op: 'gt', value: 1000 }] })

    expect(above.rows.map((row) => row.amount)).toEqual(['2539.24', '1200'])
    expect(queryRows(rows, resolve, { filters: [{ field: 'description', op: 'lt', value: 10 }] }).matched).toBe(0)
  })

  it('sorts text, numbers and dates, keeping blanks last in both directions', () => {
    const byAmount = queryRows(rows, resolve, { sort: { field: 'amount', type: 'number', direction: 'desc' } })
    const byDate = queryRows(rows, resolve, { sort: { field: 'date', type: 'date', direction: 'asc' } })
    const byText = queryRows(rows, resolve, { sort: { field: 'description', direction: 'asc' } })

    expect(byAmount.rows.map((row) => row.amount)).toEqual(['2539.24', '1200', '260', '19.90', ''])
    expect(byDate.rows[0].date).toBe('18/08/2025')
    expect(byDate.rows.at(-1)!.date).toBe('')
    expect(byText.rows.at(-1)!.description).toBe('')
  })

  it('pages, reporting what it looked at and what is left', () => {
    const page = queryRows(rows, resolve, { filters: [{ field: 'status', op: 'equals', value: 'unlabelled' }], offset: 1, limit: 1 })

    expect(page).toMatchObject({ total: 5, matched: 3, offset: 1, returned: 1, hasMore: true })
  })

  it('finds the empty and the filled', () => {
    expect(queryRows(rows, resolve, { filters: [{ field: 'description', op: 'isEmpty' }] }).matched).toBe(1)
    expect(queryRows(rows, resolve, { filters: [{ field: 'description', op: 'isNotEmpty' }] }).matched).toBe(4)
  })
})

describe('groupRows', () => {
  it('reports the most common values first, folding case and accents together', () => {
    const groups = groupRows(rows, resolve, 'description')

    expect(groups[0]).toEqual({ value: 'Pagamento de fatura', count: 2 })
    expect(groups.map((group) => group.count).reduce((sum, count) => sum + count, 0)).toBe(rows.length)
  })
})
