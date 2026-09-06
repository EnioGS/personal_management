import { describe, expect, it } from 'vitest'
import { admits, isWrite } from './statement-gate'

const tables = ['confirmed__finances__movements', 'source__banco__1', 'label_rules']

describe('what the gate admits', () => {
  it('lets the four verbs of table work through', () => {
    expect(admits('SELECT * FROM "confirmed__finances__movements"', tables)).toBeNull()
    expect(admits(`UPDATE "confirmed__finances__movements" SET category = 'x'`, tables)).toBeNull()
    expect(admits(`DELETE FROM "source__banco__1" WHERE id = 3`, tables)).toBeNull()
    expect(admits(`INSERT INTO "label_rules" (name) VALUES ('x')`, tables)).toBeNull()
  })

  it('refuses everything that is not table work, wherever it appears', () => {
    expect(admits('PRAGMA table_list', tables)).toMatch(/only start with/)
    expect(admits('DROP TABLE "label_rules"', tables)).toMatch(/only start with/)
    // The dangerous case: an allowed verb reaching past the tables anyway.
    expect(admits('SELECT * FROM sqlite_master', tables)).toMatch(/not table work/)
    expect(admits('SELECT 1; DROP TABLE "label_rules"', tables)).toMatch(/One statement at a time/)
  })

  it('refuses a table nobody has', () => {
    expect(admits('SELECT * FROM "confirmed__finances__nowhere"', tables)).toMatch(/no table called/)
  })

  it('is not fooled by a merchant with a keyword in its name', () => {
    expect(admits(`UPDATE "confirmed__finances__movements" SET category = 'Pragma Café' WHERE id = 1`, tables)).toBeNull()
    expect(admits(`SELECT * FROM "confirmed__finances__movements" WHERE observations LIKE '%drop%'`, tables)).toBeNull()
  })

  it('knows a read from a write, which is what decides whether anything is planned', () => {
    expect(isWrite('SELECT 1')).toBe(false)
    expect(isWrite('  update x set y = 1')).toBe(true)
  })

  it('says so when there is nothing there', () => {
    expect(admits('   ', tables)).toMatch(/no statement/)
  })
})

describe('what a refusal tells the model to do next', () => {
  it('names a tool it can still call', () => {
    const refusal = admits('SELECT * FROM "confirmed__finances__nowhere"', tables) ?? ''

    expect(refusal).toContain('run_sql')
    // The tool it used to name was retired the day SQL replaced it.
    expect(refusal).not.toContain('query_vault')
  })
})
