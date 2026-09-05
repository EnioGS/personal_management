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
    expect(sql).toBe('INSERT INTO "budgets" ("id", "created_at", "category", "monthly_amount") VALUES (?, ?, ?, ?)')
  })

  it('builds a SELECT * equivalent that names every column explicitly', () => {
    const sql = selectAllSql(SQLITE_SCHEMAS.notes)
    expect(sql).toBe('SELECT "id", "created_at", "title", "body", "updated_at" FROM "notes"')
  })

  it('never names a column twice — a stored row already has an id and a created_at', () => {
    for (const [key, schema] of Object.entries(SQLITE_SCHEMAS)) {
      const names = columnNames(schema)
      expect(new Set(names).size, key).toBe(names.length)
    }
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

  it('round-trips a source file with its columns, assignments and sign convention', () => {
    const file = {
      id: 3,
      createdAt: 2,
      data: {
        originalFilename: 'nubank_2026-09.csv',
        importedAt: 2,
        rawCsv: 'Data,Valor\n01/09/2026,"-10,00"',
        originalColumns: ['Data', 'Valor'],
        assignments: { Data: 'date', Valor: 'amount' },
        signConvention: { kind: 'invertWhen', column: 'Tipo', values: ['D'] },
      },
    }

    expect(sqlValuesToRow(SQLITE_SCHEMAS.sourceFiles, rowToSqlValues(SQLITE_SCHEMAS.sourceFiles, file))).toEqual(file)
  })

  it('round-trips a source row with its verbatim values and its four labels', () => {
    const row = {
      id: 11,
      createdAt: 4,
      data: {
        sourceId: 3,
        rowId: 'a1b2c3',
        values: { Data: '01/09/2026', Valor: '-10,00' },
        labels: { sections: ['finances'], screens: ['spending'], category: 'mercado', subcategory: 'outros' },
        markedForElimination: false,
        appliedRuleIds: [7],
      },
    }

    expect(sqlValuesToRow(SQLITE_SCHEMAS.sourceRows, rowToSqlValues(SQLITE_SCHEMAS.sourceRows, row))).toEqual(row)
  })

  it('round-trips a confirmed row, signed amount and all', () => {
    const row = {
      id: 9,
      createdAt: 42,
      data: {
        rowId: 'a1b2c3',
        section: 'finances',
        screen: 'spending',
        sourceFilename: 'nubank_2026-09.csv',
        confirmedAt: 42,
        date: 1700000000000,
        amount: -123.45,
        observations: '{"descricao":"Mercado"}',
        category: 'mercado',
        subcategory: 'outros',
      },
    }

    expect(sqlValuesToRow(SQLITE_SCHEMAS.confirmedRows, rowToSqlValues(SQLITE_SCHEMAS.confirmedRows, row))).toEqual(row)
  })

  it('round-trips a rule with its stage, its stacked conditions and its rationale', () => {
    const rule = {
      id: 2,
      createdAt: 1,
      data: {
        name: 'Netflix',
        context: 'source',
        field: 'description',
        contains: 'netflix',
        match: 'startsWith',
        caseSensitive: false,
        where: [{ field: 'source_filename', contains: 'fatura' }],
        labels: { category: 'assinaturas' },
        rationale: 'Always the subscription.',
        createdBy: 'assistant',
        createdAt: 1,
      },
    }

    expect(sqlValuesToRow(SQLITE_SCHEMAS.labelRules, rowToSqlValues(SQLITE_SCHEMAS.labelRules, rule))).toEqual(rule)
  })

  it('columnNames always starts with id, created_at', () => {
    expect(columnNames(SQLITE_SCHEMAS.allocationTargets)).toEqual(['id', 'created_at', 'asset', 'target_percent'])
  })
})
