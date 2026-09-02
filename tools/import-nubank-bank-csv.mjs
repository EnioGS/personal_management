#!/usr/bin/env node

/**
 * Idempotently imports one Nubank account statement into an exported Personal
 * Management SQLite database. The statement's four original fields form a
 * SHA-256 import key, while old exports without that key are matched by the
 * ledger values already stored in the database.
 *
 * Usage:
 *   node tools/import-nubank-bank-csv.mjs --db FILE --file FILE [--table-id 1] [--dry-run]
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

function option(name, fallback) {
  const index = process.argv.indexOf(name)
  return index === -1 ? fallback : process.argv[index + 1]
}

const database = option('--db')
const file = option('--file')
const tableId = Number(option('--table-id', '1'))
const dryRun = process.argv.includes('--dry-run')

if (!database || !file || !Number.isInteger(tableId)) {
  throw new Error('Usage: node tools/import-nubank-bank-csv.mjs --db FILE --file FILE [--table-id 1] [--dry-run]')
}

function sqlite(sql) {
  return execFileSync('sqlite3', ['-json', database, sql], { encoding: 'utf8' })
}

function query(sql) {
  const output = sqlite(sql).trim()
  return output ? JSON.parse(output) : []
}

function quote(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${String(value).replaceAll("'", "''")}'`
}

function parseCsv(input) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''))
      if (row.some((value) => value !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ''))
    if (row.some((value) => value !== '')) rows.push(row)
  }
  return rows
}

function dateToMillis(value) {
  const [day, month, year] = value.split('/').map(Number)
  if (!day || !month || !year) throw new Error(`Invalid date: ${value}`)
  return Date.UTC(year, month - 1, day)
}

function cents(value) {
  return Math.round(Number(value) * 100)
}

function legacySignature({ date, direction, amount, description }) {
  return `${date}\x1f${direction}\x1f${cents(amount)}\x1f${description}`
}

function sourceKey({ dateText, valueText, identifier, description }) {
  return createHash('sha256').update([dateText, valueText, identifier, description].map((value) => value.trim()).join('\x1f')).digest('hex')
}

function rawCategory(description) {
  return description.split(' - ')[0].trim() || description
}

function ensureColumnsAndInvestmentClasses() {
  const entryColumns = query('PRAGMA table_info(entries)').map((column) => column.name)
  const tableDefColumns = query('PRAGMA table_info(table_defs)').map((column) => column.name)
  const changes = []
  if (!entryColumns.includes('import_key')) changes.push('ALTER TABLE entries ADD COLUMN import_key TEXT')
  if (!tableDefColumns.includes('investment_class')) changes.push('ALTER TABLE table_defs ADD COLUMN investment_class TEXT')
  if (changes.length && !dryRun) sqlite(`BEGIN IMMEDIATE; ${changes.join('; ')}; COMMIT;`)

  const tables = query("SELECT id, name, kind, investment_class AS investmentClass FROM table_defs WHERE kind = 'investmentLedger'")
  const updates = tables
    .filter((table) => !table.investmentClass)
    .map((table) => {
      const fixed = /fixed|renda\\s*fixa|tesouro|cdb|lci|lca/i.test(table.name)
      return `UPDATE table_defs SET investment_class = ${quote(fixed ? 'fixedIncome' : 'variableIncome')} WHERE id = ${Number(table.id)}`
    })
  if (updates.length && !dryRun) sqlite(`BEGIN IMMEDIATE; ${updates.join('; ')}; COMMIT;`)
}

const parsed = parseCsv(readFileSync(file, 'utf8'))
const [header, ...csvRows] = parsed
if (header?.join(',') !== 'Data,Valor,Identificador,Descrição') {
  throw new Error(`Unexpected Nubank CSV header: ${header?.join(',')}`)
}

const sourceRows = csvRows.map((row) => {
  if (row.length !== 4) throw new Error(`Expected four columns, received ${row.length}: ${row.join(',')}`)
  const [dateText, valueText, identifier, description] = row
  const signedAmount = Number(valueText)
  if (!Number.isFinite(signedAmount)) throw new Error(`Invalid amount: ${valueText}`)
  const entry = {
    date: dateToMillis(dateText),
    direction: signedAmount >= 0 ? 'in' : 'out',
    amount: Math.abs(signedAmount),
    category: rawCategory(description),
    description,
    importKey: sourceKey({ dateText, valueText, identifier, description }),
  }
  return entry
})

const sourceKeys = new Set()
const uniqueSourceRows = sourceRows.filter((row) => {
  if (sourceKeys.has(row.importKey)) return false
  sourceKeys.add(row.importKey)
  return true
})

ensureColumnsAndInvestmentClasses()
const existingRows = query(`SELECT date, direction, amount, description, import_key AS importKey FROM entries WHERE table_id = ${tableId}`)
const knownImportKeys = new Set(existingRows.map((row) => row.importKey).filter(Boolean))
const legacyRows = new Set(existingRows.map(legacySignature))
const toInsert = uniqueSourceRows.filter((row) => !knownImportKeys.has(row.importKey) && !legacyRows.has(legacySignature(row)))
const before = existingRows.length

if (toInsert.length && !dryRun) {
  const createdAt = Date.now()
  const inserts = toInsert.map(
    (row) =>
      `INSERT INTO entries (created_at, table_id, deleted, import_key, date, direction, category, description, amount) VALUES (${createdAt}, ${tableId}, 0, ${quote(row.importKey)}, ${row.date}, ${quote(row.direction)}, ${quote(row.category)}, ${quote(row.description)}, ${row.amount})`,
  )
  sqlite(`BEGIN IMMEDIATE; ${inserts.join('; ')}; COMMIT;`)
}

const after = query(`SELECT COUNT(*) AS count FROM entries WHERE table_id = ${tableId}`)[0].count
const importedKeyCount = query(
  `SELECT COUNT(*) AS count FROM entries WHERE table_id = ${tableId} AND import_key IN (${[...sourceKeys].map(quote).join(', ')})`,
)[0].count
const knownLegacyCount = uniqueSourceRows.filter((row) => legacyRows.has(legacySignature(row))).length

console.log(
  JSON.stringify({
    file,
    dryRun,
    sourceRows: sourceRows.length,
    duplicateRowsInsideSource: sourceRows.length - uniqueSourceRows.length,
    alreadyPresent: uniqueSourceRows.length - toInsert.length,
    inserted: dryRun ? 0 : toInsert.length,
    bankRowsBefore: before,
    bankRowsAfter: after,
    expectedBankRowsAfter: before + (dryRun ? 0 : toInsert.length),
    sourceRowsFoundByImportKey: importedKeyCount,
    sourceRowsFoundByLegacyMatch: knownLegacyCount,
  }),
)
