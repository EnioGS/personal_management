import Papa from 'papaparse'
import type { LocalRow } from '@/lib/local-store/create-local-table'
import {
  entriesTable,
  ingestionAuditEventsTable,
  ingestionColumnMappingsTable,
  ingestionRowsTable,
  ingestionSourcesTable,
} from './model-db'
import { allPotentialIngestionFields } from './ingestion'
import { applyLabelRulesToRows } from './label-rules-repository'
import { markDuplicateSourceRows, type SourceRowMark } from './source-row-marks'
import { FINANCE_DESTINATIONS, FLOW_ROLES, matchLabelValue, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS } from './label-vocabulary'
import type { Entry, IngestionColumnMapping, IngestionRow, IngestionSource, IngestionTargetField } from './types'

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
  // Duplicates are found when the file arrives, not when someone thinks to ask.
  await rescanSourceRowDuplicates(sourceId)
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

/** What a virtual column holds for one row: its per-row value, else its fill, else blank. */
export function supplementalValueFor(source: IngestionSource, column: string, rowIndex: number): string {
  const values = source.supplementalValues?.[column]
  return values?.rows?.[String(rowIndex)] ?? values?.all ?? ''
}

/**
 * Writes into a virtual column: one value for every row, or values for named rows.
 *
 * This is how information the file itself does not carry gets in — most often where a
 * row came from, when the filename is the only thing that says so. The uploaded CSV is
 * never rewritten; the column is the app's own annotation, and it is marked as such.
 */
export async function fillSupplementalColumn(
  sourceId: number,
  column: string,
  value: { all?: string; rows?: Record<string, string> },
): Promise<IngestionSource> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const source = sourceData(sourceRow)
  if (!source.supplementalColumns.includes(column)) throw new Error(`"${column}" is not a supplemental column of this source. Add it first; original columns are never rewritten.`)
  const existing = source.supplementalValues?.[column] ?? {}
  const next: IngestionSource = {
    ...source,
    supplementalValues: {
      ...(source.supplementalValues ?? {}),
      [column]: { all: value.all ?? existing.all, rows: { ...(existing.rows ?? {}), ...(value.rows ?? {}) } },
    },
  }
  await ingestionSourcesTable.update(sourceId, { data: next })
  return next
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

/** Copies explicitly mapped label columns into a staged row; invalid values remain empty for manual review. */
function labelsFromMappedValues(values: IngestionRow['mappedValues']): IngestionRow['labels'] {
  const text = (field: keyof IngestionRow['mappedValues']) => (typeof values[field] === 'string' ? (values[field] as string) : undefined)
  const categoryId = typeof values.categoryId === 'string' && /^\d+$/.test(values.categoryId) ? Number(values.categoryId) : undefined
  const destination = matchLabelValue(FINANCE_DESTINATIONS, text('financeDestination'))
  const flowRole = matchLabelValue(FLOW_ROLES, text('flowRole'))
  const settlementChannel = matchLabelValue(SETTLEMENT_CHANNELS, text('settlementChannel'))
  const spendingTreatment = matchLabelValue(SPENDING_TREATMENTS, text('spendingTreatment'))
  const recurrence = matchLabelValue(RECURRENCES, text('recurrence'))
  return {
    ...(destination ? { financeDestination: destination } : {}),
    ...(flowRole ? { flowRole } : {}),
    ...(settlementChannel ? { settlementChannel } : {}),
    ...(spendingTreatment ? { spendingTreatment } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(recurrence ? { recurrence } : {}),
  }
}

/**
 * Sends a fully mapped source into the unlabelled worklist. Staging is idempotent:
 * existing source-row fingerprints are retained and reported instead of duplicated.
 */
export interface StagingPlan {
  /** Rows that would be staged: no mark, and not staged already. */
  ready: number[]
  /** Rows the scan flagged and nobody has ruled on. */
  duplicate: number[]
  /** Rows someone decided against; they are dropped rather than staged. */
  eliminate: number[]
  /** Rows already staged from an earlier pass. */
  alreadyStaged: number[]
}

/** What staging this source would do, so the screen and the assistant can say so first. */
export async function planIngestionStaging(sourceId: number): Promise<StagingPlan> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const source = sourceData(sourceRow)
  const parsed = source.rawCsv ? parseIngestionCsv(source.rawCsv) : { columns: [], rows: [] }
  const staged = new Set(
    (await ingestionRowsTable.toArray())
      .map((row) => row.data as IngestionRow)
      .filter((row) => row.sourceId === sourceId)
      .map((row) => row.sourceRowIndex),
  )
  const plan: StagingPlan = { ready: [], duplicate: [], eliminate: [], alreadyStaged: [] }
  parsed.rows.forEach((_row, index) => {
    if (staged.has(index)) { plan.alreadyStaged.push(index); return }
    const mark = source.rowMarks?.[String(index)]
    if (mark === 'eliminate') plan.eliminate.push(index)
    else if (mark === 'duplicate') plan.duplicate.push(index)
    else plan.ready.push(index)
  })
  return plan
}

/**
 * Sends a source's rows into the worklist.
 *
 * `readyOnly` stages what nobody has flagged and leaves the questionable rows in the
 * file for another look; the default stages those too, which is why the screen asks
 * before doing it. Rows marked for elimination are never staged either way, and rows
 * staged by an earlier pass are not staged twice.
 */
export async function stageIngestionSource(sourceId: number, options: { readyOnly?: boolean } = {}): Promise<{ staged: number; duplicates: number; skippedDuplicateMarks: number; eliminated: number }> {
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
  let skippedDuplicateMarks = 0
  let eliminated = 0

  for (const [sourceRowIndex, rawOriginalValues] of parsed.rows.entries()) {
    const mark = source.rowMarks?.[String(sourceRowIndex)]
    // A row someone ruled against never enters the worklist, however it was mapped.
    if (mark === 'eliminate') { eliminated += 1; continue }
    if (mark === 'duplicate' && options.readyOnly) { skippedDuplicateMarks += 1; continue }
    const rawValues = Object.fromEntries([
      ...Object.entries(rawOriginalValues),
      ...source.supplementalColumns.map((column) => [column, supplementalValueFor(source, column, sourceRowIndex)]),
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
      labels: labelsFromMappedValues(mappedValues),
      status: 'unlabelled',
      validationErrors: [],
    })
  }

  if (staged.length > 0) {
    await ingestionRowsTable.bulkAdd(staged.map((row) => ({ createdAt: Date.now(), data: row })))
  }
  await ingestionSourcesTable.update(sourceId, { data: { ...source, status: 'staged' } })
  // Standing rules meet the rows the moment they arrive, so an import that a rule
  // fully covers lands ready instead of waiting for the same decision to be made again.
  if (staged.length > 0) await applyLabelRulesToRows()
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'rowsStaged', actor: 'user', sourceId, details: { staged: staged.length, duplicates } },
  })
  return { staged: staged.length, duplicates, skippedDuplicateMarks, eliminated }
}

/**
 * Removes a source file whose rows have all been dealt with — every one of them
 * either confirmed into a Finance table or discarded as a duplicate. A row still
 * waiting in the worklist blocks removal, since that is unfinished work rather than
 * clutter.
 *
 * Confirmed rows survive: they are the provenance of real entries, so they keep their
 * raw values and are stamped with the filename they came from. The file's own copy,
 * its column mappings and its discarded rows go — a discarded row is a duplicate of
 * something that exists elsewhere, which is exactly what nobody needs a second copy of.
 */
export async function removeFinishedIngestionSource(sourceId: number): Promise<{ keptRows: number; deletedRows: number; originalFilename: string }> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const source = sourceData(sourceRow)
  if (source.legacy) throw new Error('The existing-data migration is not an uploaded file; it disappears on its own once every queued row is dealt with.')

  const rows = (await ingestionRowsTable.toArray()).filter((row) => (row.data as IngestionRow).sourceId === sourceId)
  const pending = rows.filter((row) => {
    const status = (row.data as IngestionRow).status
    return status !== 'promoted' && status !== 'reconciledExisting' && status !== 'discarded'
  })
  if (pending.length > 0) throw new Error(`"${source.originalFilename}" still has ${pending.length} row(s) waiting in the worklist. Confirm or discard them first.`)

  const discarded = rows.filter((row) => (row.data as IngestionRow).status === 'discarded')
  const kept = rows.filter((row) => (row.data as IngestionRow).status !== 'discarded')
  for (const row of kept) {
    await ingestionRowsTable.update(row.id, { data: { ...(row.data as IngestionRow), sourceFilename: source.originalFilename } })
  }
  await ingestionRowsTable.bulkDelete(discarded.map((row) => row.id))
  const mappings = (await ingestionColumnMappingsTable.toArray()).filter((row) => mappingData(row).sourceId === sourceId)
  await ingestionColumnMappingsTable.bulkDelete(mappings.map((row) => row.id))
  await ingestionSourcesTable.delete(sourceId)
  await ingestionAuditEventsTable.add({
    createdAt: Date.now(),
    data: { event: 'rowsDiscarded', actor: 'user', sourceId, details: { removedSource: source.originalFilename, keptRows: kept.length, deletedRows: discarded.length } },
  })
  return { keptRows: kept.length, deletedRows: discarded.length, originalFilename: source.originalFilename }
}

/** Re-runs the duplicate scan over a file's own rows and stores what it found. */
export async function rescanSourceRowDuplicates(sourceId: number): Promise<IngestionSource> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const source = sourceData(sourceRow)
  if (!source.rawCsv) return source
  const parsed = parseIngestionCsv(source.rawCsv)
  const storedRows = (await ingestionRowsTable.toArray()).map((row) => row.data as IngestionRow)
  const entries = (await entriesTable.toArray()).map((row) => row.data as Entry).filter((entry) => !entry.deleted)
  const rowMarks = markDuplicateSourceRows(source, parsed.rows, storedRows, entries, source.rowMarks ?? {})
  const next = { ...source, rowMarks }
  await ingestionSourcesTable.update(sourceId, { data: next })
  return next
}

/** Records a verdict on file rows: what to eliminate, what is a duplicate, or neither. */
export async function markSourceRows(sourceId: number, rowIndexes: number[], mark: SourceRowMark | null): Promise<IngestionSource> {
  const sourceRow = await ingestionSourcesTable.get(sourceId)
  if (!sourceRow) throw new Error(`Ingestion source ${sourceId} was not found.`)
  const source = sourceData(sourceRow)
  const rowMarks = { ...(source.rowMarks ?? {}) }
  for (const index of rowIndexes) {
    if (mark) rowMarks[String(index)] = mark
    else delete rowMarks[String(index)]
  }
  const next = { ...source, rowMarks }
  await ingestionSourcesTable.update(sourceId, { data: next })
  return next
}
