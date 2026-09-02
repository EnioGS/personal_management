import { describe, expect, it } from 'vitest'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { Account, Category, CategoryRule, Entry, TableDef } from '@/lib/model/types'
import { filterMoneyEntries } from './use-dashboard-entries'
import type { DashboardFilters } from './dashboard-filters'

function baseFilters(overrides: Partial<DashboardFilters> = {}): DashboardFilters {
  return {
    preset: 'thisYear',
    customFrom: '',
    customTo: '',
    accountIds: [],
    cardIds: [],
    categories: [],
    ...overrides,
  }
}

const account1: StoredRow<Account> = { id: 1, createdAt: 0, name: 'Banco A', kind: 'checking' }
const account2: StoredRow<Account> = { id: 2, createdAt: 0, name: 'Banco B', kind: 'checking' }

const bankTable1: StoredRow<TableDef> = { id: 10, createdAt: 0, name: 'Extrato A', kind: 'bankLedger', accountId: 1 }
const bankTable2: StoredRow<TableDef> = { id: 11, createdAt: 0, name: 'Extrato B', kind: 'bankLedger', accountId: 2 }
const cardTable: StoredRow<TableDef> = { id: 12, createdAt: 0, name: 'Cartão X', kind: 'cardLedger', cardId: 100 }
const genericTable: StoredRow<TableDef> = { id: 13, createdAt: 0, name: 'Gastos', kind: 'generic' }

const THIS_YEAR = new Date().getUTCFullYear()
const inYear = Date.UTC(THIS_YEAR, 2, 1)
const lastYear = Date.UTC(THIS_YEAR - 1, 2, 1)

function entry(id: number, overrides: Partial<Entry> & { tableId: number }): StoredRow<Entry> {
  return { id, createdAt: 0, date: inYear, amount: 100, ...overrides }
}

describe('filterMoneyEntries', () => {
  it('excludes soft-deleted entries', () => {
    const result = filterMoneyEntries({
      entries: [entry(1, { tableId: 13, deleted: true })],
      tableDefs: [genericTable],
      accounts: [],
      categories: [],
      rules: [],
      filters: baseFilters(),
    })
    expect(result).toHaveLength(0)
  })

  it('excludes an entry whose table no longer exists', () => {
    const result = filterMoneyEntries({
      entries: [entry(1, { tableId: 999 })],
      tableDefs: [genericTable],
      accounts: [],
      categories: [],
      rules: [],
      filters: baseFilters(),
    })
    expect(result).toHaveLength(0)
  })

  it('excludes an entry outside the resolved date range', () => {
    const result = filterMoneyEntries({
      entries: [entry(1, { tableId: 13, date: lastYear })],
      tableDefs: [genericTable],
      accounts: [],
      categories: [],
      rules: [],
      filters: baseFilters({ preset: 'thisYear' }),
    })
    expect(result).toHaveLength(0)
  })

  it('marks bankLedger "in" entries as incoming and everything else as outgoing', () => {
    const result = filterMoneyEntries({
      entries: [
        entry(1, { tableId: 10, direction: 'in' }),
        entry(2, { tableId: 10, direction: 'out' }),
        entry(3, { tableId: 13 }), // generic — no direction field at all
      ],
      tableDefs: [bankTable1, genericTable],
      accounts: [account1],
      categories: [],
      rules: [],
      filters: baseFilters(),
    })
    expect(result.map((r) => r.direction)).toEqual(['in', 'out', 'out'])
  })

  it('filters by account, excluding tables with no account at all', () => {
    const result = filterMoneyEntries({
      entries: [entry(1, { tableId: 10 }), entry(2, { tableId: 11 }), entry(3, { tableId: 13 })],
      tableDefs: [bankTable1, bankTable2, genericTable],
      accounts: [account1, account2],
      categories: [],
      rules: [],
      filters: baseFilters({ accountIds: [1] }),
    })
    expect(result).toHaveLength(1)
    expect(result[0].accountName).toBe('Banco A')
  })

  it('filters by card, excluding tables with no card', () => {
    const result = filterMoneyEntries({
      entries: [entry(1, { tableId: 12 }), entry(2, { tableId: 13 })],
      tableDefs: [cardTable, genericTable],
      accounts: [],
      categories: [],
      rules: [],
      filters: baseFilters({ cardIds: [100] }),
    })
    expect(result).toHaveLength(1)
    expect(result[0].cardId).toBe(100)
  })

  it('resolves categories per the table kind and filters by them', () => {
    const category: StoredRow<Category> = { id: 1, createdAt: 0, name: 'Mercado' }
    const rule: StoredRow<CategoryRule> = {
      id: 1,
      createdAt: 0,
      categoryId: 1,
      match: 'contains',
      pattern: 'supermercado',
      priority: 0,
    }
    const result = filterMoneyEntries({
      entries: [
        entry(1, { tableId: 13, category: 'Supermercado ABC' }),
        entry(2, { tableId: 13, category: 'Farmácia' }),
      ],
      tableDefs: [genericTable],
      accounts: [],
      categories: [category],
      rules: [rule],
      filters: baseFilters({ categories: ['Mercado'] }),
    })
    expect(result).toHaveLength(1)
    expect(result[0].category).toBe('Mercado')
  })

  it('an empty filter dimension means "everything", not "nothing"', () => {
    const result = filterMoneyEntries({
      entries: [entry(1, { tableId: 10 })],
      tableDefs: [bankTable1],
      accounts: [account1],
      categories: [],
      rules: [],
      filters: baseFilters(), // no accountIds/cardIds/categories set
    })
    expect(result).toHaveLength(1)
  })
})
