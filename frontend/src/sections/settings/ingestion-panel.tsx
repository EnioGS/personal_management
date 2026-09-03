import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { Check, FilePlus2, Plus, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  createIngestionSource,
  createSupplementalColumn,
  parseIngestionCsv,
  saveIngestionMappings,
  stageIngestionSource,
  validateIngestionMappings,
} from '@/lib/model/ingestion-source'
import { createIngestionSourcesFromDatabaseFile } from '@/lib/model/ingestion-database-file'
import { promoteReadyIngestionRows, reallocateConfirmedIngestionRows, updateIngestionRowWorklist } from '@/lib/model/ingestion-promotion'
import {
  useCategoriesStore,
  useIngestionColumnMappingsStore,
  useIngestionRowsStore,
  useIngestionSourcesStore,
  useTableDefsStore,
} from '@/lib/model/model-stores'
import { FINANCE_DESTINATIONS, FLOW_ROLES, labelValues, matchLabelValue, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS } from '@/lib/model/label-vocabulary'
import type { IngestionColumnMapping, IngestionRowLabels, IngestionRowLabelValues, IngestionTargetField } from '@/lib/model/types'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { IngestionRow } from '@/lib/model/types'

const TARGET_FIELDS: IngestionTargetField[] = [
  'date', 'amount', 'description', 'rawCategory', 'direction', 'asset', 'investmentType', 'quantity', 'price', 'note', 'destination',
  'financeDestination', 'flowRole', 'settlementChannel', 'spendingTreatment', 'categoryId', 'recurrence', 'destinationTableId',
]

const UNLABELLED_DATASET = '__unlabelled__'
const CONFIRMED_DATASET = '__confirmed__'
const LABEL_FIELDS = ['financeDestination', 'flowRole', 'settlementChannel', 'spendingTreatment', 'category', 'recurrence', 'destinationTable'] as const
const DATA_FIELDS = TARGET_FIELDS.filter((field) => !['financeDestination', 'flowRole', 'settlementChannel', 'spendingTreatment', 'categoryId', 'recurrence', 'destinationTableId'].includes(field))
/** The accepted values of each closed label column, shown as the cell's own hint. */
const LABEL_OPTIONS: Record<typeof LABEL_FIELDS[number], string> = {
  financeDestination: labelValues(FINANCE_DESTINATIONS).join(' | '),
  flowRole: labelValues(FLOW_ROLES).join(' | '),
  settlementChannel: labelValues(SETTLEMENT_CHANNELS).join(' | '),
  spendingTreatment: labelValues(SPENDING_TREATMENTS).join(' | '),
  category: 'free text — a new name creates the category',
  recurrence: labelValues(RECURRENCES).join(' | '),
  destinationTable: 'one of your tables',
}

/**
 * The first usable slice of the ingestion centre: CSV sources remain raw, their
 * columns are mapped above the original names, and only a valid complete mapping
 * can stage them into the separate unlabelled worklist. Row labels/promotion follow
 * in the next phase, so this screen intentionally never writes an app entry.
 */
export function IngestionPanel() {
  const sourceStore = useIngestionSourcesStore()
  const mappingStore = useIngestionColumnMappingsStore()
  const rowStore = useIngestionRowsStore()
  const categories = useCategoriesStore((store) => store.items)
  const addCategory = useCategoriesStore((store) => store.addItem)
  const tableDefs = useTableDefsStore((store) => store.items)
  const [selected, setSelected] = useState(UNLABELLED_DATASET)
  const [draftMappings, setDraftMappings] = useState<IngestionColumnMapping[] | null>(null)
  const [supplementalName, setSupplementalName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [worklistFieldName, setWorklistFieldName] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  const selectedSource = sourceStore.items.find((source) => String(source.id) === selected)
  const mappings = selectedSource
    ? (draftMappings ?? mappingStore.items.filter((mapping) => mapping.sourceId === selectedSource.id))
    : []
  const validation = selectedSource
    ? validateIngestionMappings(selectedSource.originalColumns, selectedSource.supplementalColumns, mappings)
    : null
  // A source with no file (the migration's own) has nothing to parse, and a parser
  // error must never escape into the render — it would unmount the whole app.
  const sourcePreview = useMemo(() => {
    if (!selectedSource?.rawCsv) return []
    try {
      return parseIngestionCsv(selectedSource.rawCsv).rows
    } catch {
      return []
    }
  }, [selectedSource])
  // Ready rows first. They are the only rows the confirmation button acts on, and a
  // backlog of hundreds otherwise buries them; the sort is stable, so everything else
  // keeps the order it was queued in.
  const rows = useMemo(() => {
    const active = rowStore.items.filter((row) => row.status !== 'promoted' && row.status !== 'reconciledExisting')
    return [...active].sort((left, right) => Number(right.status === 'ready') - Number(left.status === 'ready'))
  }, [rowStore.items])
  // Rows whose entry already exists. Edits here wait for reallocation the same way a
  // staged row waits for promotion, so a pending change sorts to the top.
  const confirmedRows = useMemo(() => {
    const finalized = rowStore.items.filter((row) => row.status === 'promoted' || row.status === 'reconciledExisting')
    return [...finalized].sort((left, right) => Number(right.hasPendingChange) - Number(left.hasPendingChange))
  }, [rowStore.items])
  const showingConfirmed = selected === CONFIRMED_DATASET
  const visibleRows = showingConfirmed ? confirmedRows : rows
  const reallocatable = confirmedRows.filter((row) => row.hasPendingChange && row.validationErrors.length === 0)

  function selectDataset(value: string) {
    if (value === '__none__') return
    setSelected(value)
    setDraftMappings(null)
    setMessage(null)
  }

  async function refresh() {
    await Promise.all([sourceStore.refresh(), mappingStore.refresh(), rowStore.refresh()])
  }

  /** The category label is the whole category vocabulary: a name nobody used yet creates one. */
  async function ensureCategory(name: string): Promise<number | undefined> {
    const wanted = name.trim()
    if (!wanted) return undefined
    const existing = categories.find((category) => category.name.trim().toLowerCase() === wanted.toLowerCase())
    if (existing) return existing.id
    return addCategory({ name: wanted })
  }

  async function updateWorklist(rowId: number, patch: { mappedValues?: Partial<IngestionRow['mappedValues']>; labels?: IngestionRowLabels; labelValues?: IngestionRowLabelValues; destinationTableId?: number | null }) {
    try {
      await updateIngestionRowWorklist(rowId, patch)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update labels.')
    }
  }

  async function addWorklistField() {
    const field = worklistFieldName.trim() as IngestionTargetField
    if (!DATA_FIELDS.includes(field)) {
      setMessage(`"${worklistFieldName.trim()}" is not a supported canonical data field.`)
      return
    }
    try {
      await Promise.all(rows.map((row) => updateIngestionRowWorklist(row.id, { mappedValues: { [field]: row.mappedValues[field] ?? '' } })))
      setWorklistFieldName('')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add the blank data field.')
    }
  }

  async function confirmReallocation() {
    if (reallocatable.length === 0) return
    const result = await reallocateConfirmedIngestionRows(reallocatable.map((row) => row.id))
    await refresh()
    setMessage(`Reallocated ${result.reallocated} row(s).${result.errors.length ? ` ${result.errors.join(' ')}` : ''}`)
  }

  async function confirmPromotion() {
    // The button itself is the confirmation: it names the action, is disabled until
    // something is actually ready, and every row it moves was reviewed to get there.
    const ready = rows.filter((row) => row.status === 'ready')
    if (ready.length === 0) return
    const result = await promoteReadyIngestionRows(ready.map((row) => row.id))
    await refresh()
    setMessage(`Promoted ${result.promoted} row(s), reconciled ${result.reconciled} existing row(s).${result.errors.length ? ` ${result.errors.join(' ')}` : ''}`)
  }

  /**
   * CSVs arrive as one source each. An exported database is split into one source per
   * user table it contains, so its rows enter through mapping and labelling like any
   * other file — this never restores a vault and never writes an entry.
   */
  async function handleFiles(files: FileList | null) {
    if (!files) return
    const notes: string[] = []
    try {
      for (const file of Array.from(files)) {
        const name = file.name.toLowerCase()
        if (name.endsWith('.csv')) {
          const sourceId = await createIngestionSource(file.name, await file.text())
          setSelected(String(sourceId))
          notes.push(`${file.name}: added. Assign all required fields before staging it.`)
          continue
        }
        if (name.endsWith('.db') || name.endsWith('.pmdata')) {
          const result = await createIngestionSourcesFromDatabaseFile(file.name, new Uint8Array(await file.arrayBuffer()))
          notes.push(`${file.name}: ${result.created.length} table(s) added${result.created.length ? ` — ${result.created.map((table) => `${table.name} (${table.rowCount} rows)`).join(', ')}` : ''}.`)
          for (const skipped of result.skipped) notes.push(`Skipped ${skipped.name}: ${skipped.reason}`)
          continue
        }
        throw new Error(`"${file.name}" is not a CSV or exported database file.`)
      }
      await refresh()
      setMessage(notes.join(' '))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not import the source file.')
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    void handleFiles(event.dataTransfer.files)
  }

  function setMapping(sourceColumn: string, targetField: string) {
    if (!selectedSource) return
    const existing = mappings.filter((mapping) => mapping.sourceColumn !== sourceColumn && mapping.targetField !== targetField)
    if (targetField && targetField !== '__clear__') {
      existing.push({ sourceId: selectedSource.id, sourceColumn, targetField: targetField as IngestionTargetField, isSupplemental: selectedSource.supplementalColumns.includes(sourceColumn) })
    }
    setDraftMappings(existing)
  }

  async function saveAndStage() {
    if (!selectedSource) return
    try {
      const result = await saveIngestionMappings(selectedSource.id, mappings)
      if (result.errors.length > 0) {
        setMessage(result.errors.join(' '))
        return
      }
      const staged = await stageIngestionSource(selectedSource.id)
      setDraftMappings(null)
      await refresh()
      setMessage(`Added ${staged.staged} row(s) to imported unlabelled data; ${staged.duplicates} duplicate row(s) skipped.`)
      setSelected(UNLABELLED_DATASET)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not stage this source.')
    }
  }

  async function addBlankColumn() {
    if (!selectedSource || !supplementalName.trim()) return
    try {
      await createSupplementalColumn(selectedSource.id, supplementalName)
      setSupplementalName('')
      setDraftMappings(null)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not add a blank column.')
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Data ingestion centre</h2>
          <p className="text-muted-foreground text-xs">Map raw source columns, then review and label staged rows before they can enter a Finance table.</p>
        </div>
        {/* The two worklists are not source files — they are the stages every file
            passes through — so they are their own buttons, and the dropdown keeps only
            the uploaded sources still waiting to be mapped. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={selected === UNLABELLED_DATASET ? 'default' : 'outline'} onClick={() => selectDataset(UNLABELLED_DATASET)}>
            Imported, unlabelled ({rows.length}; {rows.filter((row) => row.status === 'ready').length} ready)
          </Button>
          <Button type="button" size="sm" variant={selected === CONFIRMED_DATASET ? 'default' : 'outline'} onClick={() => selectDataset(CONFIRMED_DATASET)}>
            Confirmed ({confirmedRows.length}; {reallocatable.length} to reallocate)
          </Button>
          <Select value={selectedSource ? String(selectedSource.id) : ''} onValueChange={selectDataset}>
            <SelectTrigger className="w-72"><SelectValue placeholder={`Source files (${sourceStore.items.length})`} /></SelectTrigger>
            <SelectContent>
              {sourceStore.items.map((source) => <SelectItem key={source.id} value={String(source.id)}>{source.originalFilename} · {source.legacy ? `${rowStore.items.filter((row) => row.sourceId === source.id).length} queued rows` : `${source.rowCount} rows`}</SelectItem>)}
              {sourceStore.items.length === 0 && <SelectItem value="__none__" disabled>No source files imported yet</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      </div>

      {message && <p className="text-muted-foreground rounded-md border p-2 text-xs">{message}</p>}

      {selectedSource ? (
        selectedSource.legacy || selectedSource.originalColumns.length === 0 ? (
          <section className="flex flex-col gap-2 rounded-md border p-3 text-xs">
            <p className="font-medium">{selectedSource.originalFilename}</p>
            <p className="text-muted-foreground">This dataset has no source file: its rows were moved out of the Finance tables when the label workflow was introduced, so they are already mapped. There are no columns to assign — pick <span className="font-medium">Imported, unlabelled data</span> to label them.</p>
          </section>
        ) : (
        <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-md border p-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs"><span className="font-medium">{selectedSource.originalFilename}</span><span className="text-muted-foreground"> · original columns stay unchanged; supplemental columns are blank by design.</span></div>
            <div className="flex items-center gap-1">
              <Input value={supplementalName} onChange={(event) => setSupplementalName(event.target.value)} placeholder="Blank column name" className="h-7 w-40 text-xs" />
              <Button type="button" size="xs" variant="outline" onClick={() => void addBlankColumn()} disabled={!supplementalName.trim()}><Plus className="size-3" />Add blank column</Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded border">
            <table className="min-w-max text-left text-xs">
              <thead className="bg-muted/30">
                <tr>{[...selectedSource.originalColumns, ...selectedSource.supplementalColumns].map((column) => {
                  const current = mappings.find((mapping) => mapping.sourceColumn === column)?.targetField ?? ''
                  return <th key={column} className="min-w-44 border-b p-1 align-top"><Select value={current} onValueChange={(value) => setMapping(column, value)}><SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Assign column" /></SelectTrigger><SelectContent><SelectItem value="__clear__">No assignment</SelectItem>{TARGET_FIELDS.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}</SelectContent></Select></th>
                })}</tr>
                <tr>{[...selectedSource.originalColumns, ...selectedSource.supplementalColumns].map((column) => <th key={column} className="border-b p-2 font-medium">{column}{selectedSource.supplementalColumns.includes(column) && <span className="text-muted-foreground"> · blank</span>}</th>)}</tr>
              </thead>
              <tbody>{sourcePreview.map((rawValues, rowIndex) => <tr key={rowIndex} className="border-b">{[...selectedSource.originalColumns, ...selectedSource.supplementalColumns].map((column) => <td key={column} className="max-w-64 truncate p-2" title={rawValues[column] ?? ''}>{rawValues[column] ?? ''}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {validation && <p className={cn('text-xs', validation.errors.length ? 'text-amber-600 dark:text-amber-300' : 'text-emerald-600 dark:text-emerald-300')}>{validation.errors.length ? validation.errors.join(' ') : 'Mapping covers every possible destination table. Individual blank values are checked later.'}</p>}
        </section>
        )
      ) : (
        <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-md border p-2">
          <p className="text-muted-foreground text-xs">{showingConfirmed
            ? 'These rows are already in a Finance table. Editing a label or a data field marks the row for reallocation — its entry is rewritten, and every Finance screen follows, only when you confirm below.'
            : 'Source data is shown in its own columns. Canonical fields can be edited here; label cells accept text and turn red when the value is not one of the accepted options. Typing a category name that does not exist yet creates it.'}</p>
          <div className="min-h-0 flex-1 overflow-auto rounded border">
            <table className="min-w-max text-left text-xs"><thead className="bg-muted/30"><tr><th className="bg-muted/30 sticky left-0 z-20 w-40 min-w-40 p-2">Source</th><th className="bg-muted/30 sticky left-40 z-20 w-44 min-w-44 border-r p-2">Status</th>{rawColumns(visibleRows).map((column) => <th key={`raw-${column}`} className="min-w-36 p-2">{column}</th>)}{DATA_FIELDS.map((field) => <th key={field} className="min-w-32 p-2">{field}</th>)}{LABEL_FIELDS.map((field) => <th key={field} className="min-w-40 p-2 align-top">{field}<p className="text-muted-foreground font-normal">{LABEL_OPTIONS[field]}</p></th>)}</tr></thead><tbody>{visibleRows.map((row) => <WorklistRow key={row.id} row={row} sourceName={sourceStore.items.find((source) => source.id === row.sourceId)?.originalFilename ?? 'Existing data'} categories={categories} tableDefs={tableDefs} rawColumns={rawColumns(visibleRows)} onChange={updateWorklist} ensureCategory={ensureCategory} />)}{visibleRows.length === 0 && <tr><td colSpan={2 + DATA_FIELDS.length + LABEL_FIELDS.length} className="text-muted-foreground p-4 text-center">{showingConfirmed ? 'Nothing has been confirmed yet.' : 'No staged data yet.'}</td></tr>}</tbody></table>
          </div>
          <div className="flex items-center gap-2 text-xs"><Input value={worklistFieldName} onChange={(event) => setWorklistFieldName(event.target.value)} placeholder="Add blank canonical field, e.g. quantity" className="h-7 w-60 text-xs" /><Button type="button" size="xs" variant="outline" onClick={() => void addWorklistField()} disabled={!worklistFieldName.trim()}><Plus className="size-3" />Add blank data field</Button></div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <div className="text-xs"><p className="font-medium">Import data</p><p className="text-muted-foreground">Drop CSV files here, or an exported .db — a database is split into one dataset per table it contains.</p></div>
        <div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv,.db,.pmdata,application/vnd.sqlite3" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFiles(event.target.files)} /><Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><FilePlus2 className="size-3.5" />Import data</Button>{selectedSource
            ? <Button type="button" size="sm" disabled={!!validation?.errors.length || selectedSource.legacy || selectedSource.originalColumns.length === 0} onClick={() => void saveAndStage()}><Upload className="size-3.5" />Add to imported unlabelled data</Button>
            : showingConfirmed
              ? <Button type="button" size="sm" disabled={reallocatable.length === 0} onClick={() => void confirmReallocation()}><Check className="size-3.5" />Confirm and reallocate rows</Button>
              : <Button type="button" size="sm" disabled={!rows.some((row) => row.status === 'ready')} onClick={() => void confirmPromotion()}><Check className="size-3.5" />Confirm and move ready rows</Button>}</div>
      </div>
    </div>
  )
}

/**
 * A migrated row carries the entry's own stored value, so its date arrives as epoch
 * milliseconds. Show the date, not the number — editing it writes back a plain date
 * string, which the destination table parses just as happily.
 */
function displayDataValue(field: IngestionTargetField, value: unknown): string {
  if (field === 'date' && typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString().slice(0, 10)
  return String(value ?? '')
}

function rawColumns(rows: StoredRow<IngestionRow>[]) {
  return [...new Set(rows.flatMap((row) => Object.keys(row.rawValues)))].sort((a, b) => a.localeCompare(b))
}

function WorklistRow({ row, sourceName, categories, tableDefs, rawColumns: columns, onChange, ensureCategory }: { row: StoredRow<IngestionRow>; sourceName: string; categories: { id: number; name: string }[]; tableDefs: { id: number; name: string }[]; rawColumns: string[]; onChange: (id: number, patch: { mappedValues?: Partial<IngestionRow['mappedValues']>; labels?: IngestionRowLabels; labelValues?: IngestionRowLabelValues; destinationTableId?: number | null }) => Promise<void>; ensureCategory: (name: string) => Promise<number | undefined> }) {
  function saveData(field: IngestionTargetField, value: string) { void onChange(row.id, { mappedValues: { [field]: value } }) }
  async function saveLabel(field: typeof LABEL_FIELDS[number], value: string) {
    const draft = { ...allLabelValues(row, categories, tableDefs), [field]: value }
    const parsed = parseLabelValues(draft, categories, tableDefs)
    const categoryId = field === 'category' && !parsed.labels.categoryId ? await ensureCategory(value) : parsed.labels.categoryId
    await onChange(row.id, { labels: { ...parsed.labels, ...(categoryId ? { categoryId } : {}) }, labelValues: draft, destinationTableId: parsed.destinationTableId ?? null })
  }
  return <tr className="border-t align-top"><td className="bg-background sticky left-0 z-10 w-40 min-w-40 max-w-40 truncate p-2 font-medium" title={sourceName}>{sourceName}</td><td className="bg-background sticky left-40 z-10 w-44 min-w-44 border-r p-2">{statusCell(row)}</td>{columns.map((column) => <td key={column} className="max-w-52 truncate p-2" title={row.rawValues[column] ?? ''}>{row.rawValues[column] ?? ''}</td>)}{DATA_FIELDS.map((field) => <td key={field} className="p-1"><EditableCell value={displayDataValue(field, row.mappedValues[field])} onCommit={(value) => saveData(field, value)} /></td>)}{LABEL_FIELDS.map((field) => <td key={field} className="p-1"><EditableCell value={labelValue(row, field, categories, tableDefs)} invalid={labelFieldInvalid(row, field, categories, tableDefs)} onCommit={(value) => void saveLabel(field, value)} /></td>)}</tr>
}

/** Kept beside the source name and pinned with it: the state is why a row is on screen. */
function statusCell(row: StoredRow<IngestionRow>) {
  return (
    <>
      {row.hasPendingChange
        ? <span className="text-amber-600 dark:text-amber-300">Pending reallocation</span>
        : row.status === 'ready'
          ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300"><Check className="size-3" />Ready</span>
          : row.status}
      {row.validationErrors.length > 0 && <p className="mt-1 text-amber-600 dark:text-amber-300">{row.validationErrors[0]}</p>}
    </>
  )
}

function EditableCell({ value, invalid = false, onCommit }: { value: string; invalid?: boolean; onCommit: (value: string) => void }) {
  return <Input key={value} defaultValue={value} onBlur={(event) => { if (event.target.value !== value) onCommit(event.target.value) }} className={cn('h-7 min-w-28 text-xs', invalid && 'border-red-500 bg-red-500/10 focus-visible:ring-red-500')} />
}

function labelValue(row: StoredRow<IngestionRow>, field: typeof LABEL_FIELDS[number], categories: { id: number; name: string }[], tableDefs: { id: number; name: string }[]) {
  return allLabelValues(row, categories, tableDefs)[field] ?? ''
}

function allLabelValues(row: StoredRow<IngestionRow>, categories: { id: number; name: string }[], tableDefs: { id: number; name: string }[]): IngestionRowLabelValues {
  return {
    financeDestination: row.labels.financeDestination ?? '',
    flowRole: row.labels.flowRole ?? '',
    settlementChannel: row.labels.settlementChannel ?? '',
    spendingTreatment: row.labels.spendingTreatment ?? '',
    category: categories.find((category) => category.id === row.labels.categoryId)?.name ?? '',
    recurrence: row.labels.recurrence ?? '',
    destinationTable: tableDefs.find((table) => table.id === row.destinationTableId)?.name ?? '',
    ...row.labelValues,
  }
}

function parseLabelValues(values: IngestionRowLabelValues, categories: { id: number; name: string }[], tableDefs: { id: number; name: string }[]) {
  const category = categories.find((candidate) => candidate.name.trim().toLowerCase() === values.category?.trim().toLowerCase())
  const table = tableDefs.find((candidate) => candidate.name.trim().toLowerCase() === values.destinationTable?.trim().toLowerCase())
  const destination = matchLabelValue(FINANCE_DESTINATIONS, values.financeDestination)
  const flowRole = matchLabelValue(FLOW_ROLES, values.flowRole)
  const settlementChannel = matchLabelValue(SETTLEMENT_CHANNELS, values.settlementChannel)
  const spendingTreatment = matchLabelValue(SPENDING_TREATMENTS, values.spendingTreatment)
  const recurrence = matchLabelValue(RECURRENCES, values.recurrence)
  return {
    labels: {
      ...(destination ? { financeDestination: destination } : {}),
      ...(flowRole ? { flowRole } : {}),
      ...(settlementChannel ? { settlementChannel } : {}),
      ...(spendingTreatment ? { spendingTreatment } : {}),
      ...(category ? { categoryId: category.id } : {}),
      ...(recurrence ? { recurrence } : {}),
    } satisfies IngestionRowLabels,
    destinationTableId: table?.id,
  }
}

function labelFieldInvalid(row: StoredRow<IngestionRow>, field: typeof LABEL_FIELDS[number], categories: { id: number; name: string }[], tableDefs: { id: number; name: string }[]) {
  const value = labelValue(row, field, categories, tableDefs).trim()
  if (!value) return false
  const { labels, destinationTableId } = parseLabelValues({ ...row.labelValues, [field]: value }, categories, tableDefs)
  if (field === 'financeDestination') return !labels.financeDestination
  if (field === 'category') return false
  if (field === 'destinationTable') return !destinationTableId
  return !labels[field as keyof IngestionRowLabels]
}
