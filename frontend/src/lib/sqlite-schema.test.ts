import { describe, expect, it } from 'vitest'
import {
  columnNames,
  createTableSql,
  insertSql,
  rowToSqlValues,
  selectAllSql,
  sqlValuesToRow,
  SQLITE_SCHEMAS,
} from './sqlite-schema'

describe('sqlite-schema SQL generation', () => {
  it('builds a CREATE TABLE statement with id/created_at plus every mapped column', () => {
    const sql = createTableSql(SQLITE_SCHEMAS.accounts)
    expect(sql).toBe(
      'CREATE TABLE "accounts" (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, "name" TEXT, "kind" TEXT, "institution" TEXT, "archived" INTEGER)',
    )
  })

  it('builds an INSERT statement with one placeholder per column, in columnNames order', () => {
    const sql = insertSql(SQLITE_SCHEMAS.budgets)
    expect(sql).toBe('INSERT INTO "budgets" ("id", "created_at", "category_id", "monthly_amount") VALUES (?, ?, ?, ?)')
  })

  it('builds a SELECT * equivalent that names every column explicitly', () => {
    const sql = selectAllSql(SQLITE_SCHEMAS.notes)
    expect(sql).toBe('SELECT "id", "created_at", "text" FROM "notes"')
  })
})

describe('rowToSqlValues / sqlValuesToRow round-trip', () => {
  it('round-trips a row with text, integer, real and boolean columns', () => {
    const row = { id: 5, createdAt: 1700000000000, data: { name: 'Cartão Ouro', accountId: 2, limit: 5000.5, archived: true } }
    const values = rowToSqlValues(SQLITE_SCHEMAS.cards, row)
    expect(values).toEqual([5, 1700000000000, 'Cartão Ouro', 2, 5000.5, null, null, 1])

    const restored = sqlValuesToRow(SQLITE_SCHEMAS.cards, values)
    expect(restored).toEqual({
      id: 5,
      createdAt: 1700000000000,
      data: { name: 'Cartão Ouro', accountId: 2, limit: 5000.5, archived: true },
    })
  })

  it('omits absent optional fields entirely rather than round-tripping them as false/0', () => {
    const row = { id: 1, createdAt: 1, data: { name: 'Conta Corrente', kind: 'checking' } }
    const restored = sqlValuesToRow(SQLITE_SCHEMAS.accounts, rowToSqlValues(SQLITE_SCHEMAS.accounts, row))
    expect(restored.data).toEqual({ name: 'Conta Corrente', kind: 'checking' })
    expect('archived' in (restored.data as object)).toBe(false)
  })

  it('round-trips a false boolean distinctly from an absent one', () => {
    const row = { id: 1, createdAt: 1, data: { provider: 'openai', apiKey: 'sk-x', model: 'gpt', isActive: false } }
    const restored = sqlValuesToRow(SQLITE_SCHEMAS.assistantConfig, rowToSqlValues(SQLITE_SCHEMAS.assistantConfig, row))
    expect(restored.data).toMatchObject({ isActive: false })
  })

  it('round-trips every entries column used across the current table kinds', () => {
    const row = {
      id: 9,
      createdAt: 42,
      data: {
        tableId: 3,
        deleted: false,
        date: 1700000000000,
        direction: 'out',
        category: 'Alimentação',
        description: 'Mercado',
        amount: 123.45,
        asset: undefined,
        type: undefined,
        quantity: undefined,
        price: undefined,
        note: undefined,
        destination: undefined,
      },
    }
    const restored = sqlValuesToRow(SQLITE_SCHEMAS.entries, rowToSqlValues(SQLITE_SCHEMAS.entries, row))
    expect(restored).toEqual({
      id: 9,
      createdAt: 42,
      data: {
        tableId: 3,
        deleted: false,
        date: 1700000000000,
        direction: 'out',
        category: 'Alimentação',
        description: 'Mercado',
        amount: 123.45,
      },
    })
  })

  it('columnNames always starts with id, created_at', () => {
    expect(columnNames(SQLITE_SCHEMAS.allocationTargets)).toEqual(['id', 'created_at', 'asset', 'target_percent'])
  })
})
