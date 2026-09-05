import { describe, expect, it } from 'vitest'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { ConfirmedRow } from '@/lib/model/types'
import { describeRow, dedupeByRow, filterConfirmedRows } from './use-dashboard-entries'
import type { DashboardFilters } from './dashboard-filters'

function baseFilters(overrides: Partial<DashboardFilters> = {}): DashboardFilters {
  return { preset: 'thisYear', customFrom: '', customTo: '', categories: [], ...overrides }
}

const THIS_YEAR = new Date().getUTCFullYear()
const inYear = Date.UTC(THIS_YEAR, 2, 1)
const lastYear = Date.UTC(THIS_YEAR - 1, 2, 1)

function row(id: number, overrides: Partial<ConfirmedRow> = {}): StoredRow<ConfirmedRow> {
  return {
    id,
    createdAt: 0,
    rowId: `row-${id}`,
    section: 'finances',
    screen: 'overview',
    confirmedAt: 0,
    date: inYear,
    value: -100,
    observations: '{"source_filename":"nubank.csv"}',
    category: 'outros',
    subcategory: 'outros',
    ...overrides,
  }
}

describe('filterConfirmedRows', () => {
  it('keeps a confirmed row with its sign intact', () => {
    const result = filterConfirmedRows({ rows: [row(1, { value: 250 })], filters: baseFilters() })
    expect(result).toHaveLength(1)
    expect(result[0].value).toBe(250)
  })

  it('hides a row marked for elimination — the one thing a dashboard does not show', () => {
    expect(filterConfirmedRows({ rows: [row(1, { markedForElimination: true })], filters: baseFilters() })).toEqual([])
  })

  it('excludes a row outside the resolved date range', () => {
    expect(filterConfirmedRows({ rows: [row(1, { date: lastYear })], filters: baseFilters() })).toEqual([])
  })

  it('limits to one screen when a screen is named, and to none when it is not', () => {
    const rows = [row(1, { screen: 'overview' }), row(2, { screen: 'spending' })]
    expect(filterConfirmedRows({ rows, filters: baseFilters(), screen: 'spending' }).map((entry) => entry.rowId)).toEqual(['row-2'])
    expect(filterConfirmedRows({ rows, filters: baseFilters() })).toHaveLength(2)
  })

  it('an empty category filter means "everything", not "nothing"', () => {
    const rows = [row(1, { category: 'mercado' }), row(2, { category: 'transporte' })]
    expect(filterConfirmedRows({ rows, filters: baseFilters() })).toHaveLength(2)
    expect(filterConfirmedRows({ rows, filters: baseFilters({ categories: ['mercado'] }) })).toHaveLength(1)
  })

  it('drops a row with no usable date rather than dating it to 1970', () => {
    expect(filterConfirmedRows({ rows: [row(1, { date: undefined })], filters: baseFilters() })).toEqual([])
  })
})

describe('a row confirmed onto several screens', () => {
  it('is counted once wherever the count is about the row and not the screen', () => {
    const copies = [row(1, { screen: 'overview' }), row(2, { screen: 'spending' })].map((copy) => ({ ...copy, rowId: 'shared' }))
    const entries = filterConfirmedRows({ rows: copies, filters: baseFilters() })

    expect(entries).toHaveLength(2)
    expect(dedupeByRow(entries)).toHaveLength(1)
  })
})

describe('describeRow', () => {
  it('takes the wordiest thing the file said that no column was assigned to', () => {
    const observations = JSON.stringify({ id: '4471', descricao: 'Compra no débito - CHARME SUPERMERCADO', tipo: 'D' })
    expect(describeRow(observations)).toBe('Compra no débito - CHARME SUPERMERCADO')
  })

  it('never offers the amount the file wrote as a description', () => {
    expect(describeRow(JSON.stringify({ amount_as_imported: 'R$ 1.234,56' }))).toBe('')
  })

  it('survives observations that are not JSON at all', () => {
    expect(describeRow('just some text')).toBe('just some text')
  })
})
