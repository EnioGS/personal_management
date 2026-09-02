import Papa from 'papaparse'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import {
  ingestionAuditEventsTable,
  ingestionColumnMappingsTable,
  ingestionRowsTable,
  ingestionSourcesTable,
} from './model-db'
import { allPotentialIngestionFields } from './ingestion'
import type { IngestionColumnMapping, IngestionRow, IngestionSource, IngestionTargetField } from './types'

export interface ParsedIngestionCsv {
  columns: string[]
  rows: Record<string, string>[]
}

export interface MappingValidation {
  errors: string[]
  missingFields: IngestionTargetField[]
}

function sourceData(row: LocalRow): IngestionSource {
  return row.data as IngestionSource
}

function mappingData(row: LocalRow): IngestionColumnMapping {
  return row.data as IngestionColumnMapping
}

/** Parses a source losslessly: all fields remain strings until an explicit mapping/parser uses them. */
export function parseIngestionCsv(rawCsv: string): ParsedIngestionCsv {
  const parsed = Papa.parse<Record<string, string>>(rawCsv, { header: true, skipEmptyLines: true })
  if (parsed.errors.length > 0) throw new Error(`Could not parse CSV: ${parsed.errors[0].message}`)

  const columns = parsed.meta.fields ?? []
  if (columns.length === 0) throw new Error('The CSV has no header row.')
  if (new Set(columns).size !== columns.length) throw new Error('The CSV has duplicate column names. Rename them before importing.')
  return { columns, rows: parsed.data.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? '']))) }
}

/** Browser-native SHA-256 used for source and row idempotency. */
export async function fingerprintIngestionValue(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Validates a mapping before staging; a source starts conservatively eligible for every table kind. */
export function validateIngestionMappings(
  sourceColumns: readonly string[],
  supplementalColumns: readonly string[],
  mappings: readonly IngestionColumnMapping[],
): MappingValidation {
  const errors: string[] = []
  const validColumns = new Set([...sourceColumns, ...supplementalColumns])
  const seenColumns = new Set<string>()
  const targets = new Set<IngestionTargetField>()

  for (const mapping of mappings) {
    if (!validColumns.has(mapping.sourceColumn)) errors.push(`Unknown source column "${mapping.sourceColumn}".`)
    if (seenColumns.has(mapping.sourceColumn)) errors.push(`Source column "${mapping.sourceColumn}" is assigned more than once.`)
    if (targets.has(mapping.targetField)) errors.push(`Canonical field "${mapping.targetField}" is assigned more than once.`)
    seenColumns.add(mapping.sourceColumn)
    targets.add(mapping.targetField)
  }

  const missingFields = allPotentialIngestionFields().filter((field) => !targets.has(field))
  if (missingFields.length > 0) {
    errors.push(`Missing mappings for possible destinations: ${missingFields.join(', ')}.`)
  }
  return { errors, missingFields }
}

/** Adds a virtual empty source column without changing the uploaded file or its headers. */
export function addSupplementalColumn(source: IngestionSource, name: string): IngestionSource {
  const column = name.trim()
  if (!column) throw new Error('Supplemental column name cannot be blank.')
  if (source.originalColumns.includes(column) || source.supplementalColumns.includes(column)) {
    throw new Error(`A source column named "${column}" already exists.`)
  }
  return { ...source, supplementalColumns: [...source.supplementalColumns, column] }
}

/** Stores a new raw source once. The unchanged raw CSV is the provenance record. */
export async function createIngestionSource(originalFilename: string, rawCsv: string): Promise<number> {
  const parsed = parseIngestionCsv(rawCsv)
  const sourceFingerprint = await fingerprintIngestionValue(rawCsv)
  const existing = await ingestionSourcesTable.toArray()
  if (existing.some((row) => sourceData(row).sourceFingerprint === sourceFingerprint)) {
    throw new Error(`"${originalFilename}" was already imported as this exact source file.`)
  }

  const importedAt = Date.now()
  const sourceId = await ingestionSourcesTable.add({
    createdAt: importedAt,
    data: {
      originalFilename,
      sourceFingerprint,
      importedAt,
      rawCsv,
      originalColumns: parsed.columns,
      supplementalColumns: [],
      rowCount: parsed.rows.length,
      status: 'draftSource',
    } satisfies IngestionSource,
  })
  await ingestionAuditEventsTable.add({
    createdAt: importedAt,
    data: { event: 'sourceUploaded', actor: 'user', sourceId, details: { originalFilename, rowCount: parsed.rows.length } },
  })
  return sourceId
}

/** Replaces a source's mapping metadata after rejecting ambiguities and stale headers. */
export async function saveIngestionMappings(sourceId: number, mappings: IngestionColumnMapping[]): Promise<MappingValidation> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const source = sourceData(sourceRow)
  const validation = validateIngestionMappings(source.originalColumns, source.supplementalColumns, mappings)
  if (validation.errors.some((error) => !error.startsWith('Missing mappings'))) {
    throw new Error(validation.errors.join(' '))
  }

  const existing = await ingestionColumnMappingsTable.toArray()
  const previousIds = existing.filter((row) => mappingData(row).sourceId === sourceId).map((row) => row.id)
  if (previousIds.length > 0) await ingestionColumnMappingsTable.bulkDelete(previousIds)
  if (mappings.length > 0) {
    await ingestionColumnMappingsTable.bulkAdd(
      mappings.map((mapping) => ({ createdAt: Date.now(), data: { ...mapping, sourceId } })),
    )
  }
  await ingestionSourcesTable.update(sourceId, { data: { ...source, status: validation.missingFields.length === 0 ? 'mapped' : 'draftSource' } })
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'mappingChanged', actor: 'user', sourceId, details: { mappingCount: mappings.length, missingFields: validation.missingFields } },
  })
  return validation
}

/** Persists one explicitly named virtual blank column for a sparse source. */
export async function createSupplementalColumn(sourceId: number, name: string): Promise<IngestionSource> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const next = addSupplementalColumn(sourceData(sourceRow), name)
  await ingestionSourcesTable.update(sourceId, { data: next })
  return next
}

function stableRowValue(rawValues: Record<string, string>): string {
  return JSON.stringify(Object.entries(rawValues).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Sends a fully mapped source into the unlabelled worklist. Staging is idempotent:
 * existing source-row fingerprints are retained and reported instead of duplicated.
 */
export async function stageIngestionSource(sourceId: number): Promise<{ staged: number; duplicates: number }> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const source = sourceData(sourceRow)
  const parsed = parseIngestionCsv(source.rawCsv)
  const mappings = (await ingestionColumnMappingsTable.toArray()).map(mappingData).filter((mapping) => mapping.sourceId === sourceId)
  const validation = validateIngestionMappings(source.originalColumns, source.supplementalColumns, mappings)
  if (validation.errors.length > 0) throw new Error(validation.errors.join(' '))

  const existingFingerprints = new Set(
    (await ingestionRowsTable.toArray()).map((row) => (row.data as IngestionRow).sourceRowFingerprint),
  )
  const staged: IngestionRow[] = []
  let duplicates = 0

  for (const [sourceRowIndex, rawOriginalValues] of parsed.rows.entries()) {
    const rawValues = Object.fromEntries([
      ...Object.entries(rawOriginalValues),
      ...source.supplementalColumns.map((column) => [column, '']),
    ])
    const sourceRowFingerprint = await fingerprintIngestionValue(stableRowValue(rawValues))
    if (existingFingerprints.has(sourceRowFingerprint)) {
      duplicates += 1
      continue
    }
    existingFingerprints.add(sourceRowFingerprint)
    const mappedValues: IngestionRow['mappedValues'] = {}
    for (const mapping of mappings) mappedValues[mapping.targetField] = rawValues[mapping.sourceColumn]
    staged.push({
      sourceId,
      sourceRowIndex,
      sourceRowFingerprint,
      rawValues,
      mappedValues,
      labels: {},
      status: 'unlabelled',
      validationErrors: [],
    })
  }

  if (staged.length > 0) {
    await ingestionRowsTable.bulkAdd(staged.map((row) => ({ createdAt: Date.now(), data: row })))
  }
  await ingestionSourcesTable.update(sourceId, { data: { ...source, status: 'staged' } })
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'rowsStaged', actor: 'user', sourceId, details: { staged: staged.length, duplicates } },
  })
  return { staged: staged.length, duplicates }
}

