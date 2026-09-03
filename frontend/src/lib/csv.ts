import Papa from 'papaparse'
import { parseDateValue } from './parse-date'
import type { ColumnDef, TableSchema } from './table-schema'

export interface CsvError {
  rowIndex: number
  message: string
}

export interface CsvParseResult<T> {
  valid: T[]
  errors: CsvError[]
}

export function exportCsv<T>(rows: T[], schema: TableSchema<T>): string {
  const headers = schema.map((col) => String(col.key))
  const data = rows.map((row) =>
    schema.map((col) => {
      const value = row[col.key]
      // Dates are stored as epoch ms; write ISO strings so the CSV is human-readable
      // and Date.parse in parseCsv's coercion recovers the exact same value on import.
      return col.type === 'date' && typeof value === 'number' ? new Date(value).toISOString() : value
    }),
  )
  return Papa.unparse({ fields: headers, data })
}

export function coerceValue<T>(
  col: ColumnDef<T>,
  raw: string,
): { ok: true; value: unknown } | { ok: false; message: string } {
  const trimmed = raw.trim()
  switch (col.type) {
    case 'number': {
      const num = Number(trimmed)
      if (trimmed === '' || Number.isNaN(num)) return { ok: false, message: `"${String(col.key)}" is not a number` }
      return { ok: true, value: num }
    }
    case 'date': {
      const ms = parseDateValue(trimmed)
      if (ms === null) return { ok: false, message: `"${String(col.key)}" is not a valid date` }
      return { ok: true, value: ms }
    }
    case 'select': {
      if (!col.options?.includes(trimmed)) {
        return { ok: false, message: `"${String(col.key)}" must be one of: ${col.options?.join(', ')}` }
      }
      return { ok: true, value: trimmed }
    }
    // Open vocabulary: any non-empty value is accepted, since the whole point is that
    // an import (or the user) may introduce a value nobody has used before.
    case 'combobox': {
      if (!trimmed) return { ok: false, message: `"${String(col.key)}" is required` }
      return { ok: true, value: trimmed }
    }
    case 'text':
      if (col.required && !trimmed) return { ok: false, message: `"${String(col.key)}" is required` }
      return { ok: true, value: trimmed }
  }
}

export function parseCsv<T>(fileText: string, schema: TableSchema<T>): CsvParseResult<T> {
  const parsed = Papa.parse<Record<string, string>>(fileText, { header: true, skipEmptyLines: true })
  const valid: T[] = []
  const errors: CsvError[] = []

  parsed.data.forEach((rawRow, rowIndex) => {
    const row: Partial<T> = {}
    let rowError: string | null = null

    for (const col of schema) {
      const raw = rawRow[String(col.key)] ?? ''
      const result = coerceValue(col, raw)
      if (!result.ok) {
        rowError = result.message
        break
      }
      row[col.key] = result.value as T[typeof col.key]
    }

    if (rowError) errors.push({ rowIndex, message: rowError })
    else valid.push(row as T)
  })

  return { valid, errors }
}
