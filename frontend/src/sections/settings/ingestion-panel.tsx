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
import { promoteReadyIngestionRows, updateIngestionRowWorklist } from '@/lib/model/ingestion-promotion'
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
  const sourcePreview = useMemo(() => (selectedSource ? parseIngestionCsv(selectedSource.rawCsv).rows : []), [selectedSource])
  const rows = useMemo(() => rowStore.items.filter((row) => row.status !== 'promoted' && row.status !== 'reconciledExisting'), [rowStore.items])

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

  async function confirmPromotion() {
    const ready = rows.filter((row) => row.status === 'ready')
    if (ready.length === 0) return
    if (!window.confirm(`Move ${ready.length} ready row(s) into their destination tables? This cannot be undone from this screen.`)) return
    const result = await promoteReadyIngestionRows(ready.map((row) => row.id))
    await refresh()
    setMessage(`Promoted ${result.promoted} row(s), reconciled ${result.reconciled} existing row(s).${result.errors.length ? ` ${result.errors.join(' ')}` : ''}`)
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.csv')) throw new Error(`"${file.name}" is not a CSV file.`)
        const sourceId = await createIngestionSource(file.name, await file.text())
        setSelected(String(sourceId))
      }
      await refresh()
      setMessage('Source file added. Assign all required fields before staging it.')
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
        <Select value={selected} onValueChange={(value) => { setSelected(value); setDraftMappings(null); setMessage(null) }}>
          <SelectTrigger className="w-72"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNLABELLED_DATASET}>Imported, unlabelled data ({rows.length})</SelectItem>
            {sourceStore.items.map((source) => <SelectItem key={source.id} value={String(source.id)}>{source.originalFilename} · {source.rowCount} rows</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {message && <p className="text-muted-foreground rounded-md border p-2 text-xs">{message}</p>}

      {selectedSource ? (
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
      ) : (
        <section className="flex min-h-0 flex-1 flex-col gap-2 rounded-md border p-2">
          <p className="text-muted-foreground text-xs">Source data is shown in its own columns. Canonical fields can be edited here; label cells accept text and turn red when the value is not one of the accepted options. Typing a category name that does not exist yet creates it.</p>
          <div className="min-h-0 flex-1 overflow-auto rounded border">
            <table className="min-w-max text-left text-xs"><thead className="bg-muted/30"><tr><th className="sticky left-0 z-10 bg-muted/30 p-2">Source</th>{rawColumns(rows).map((column) => <th key={`raw-${column}`} className="min-w-36 p-2">{column}</th>)}{DATA_FIELDS.map((field) => <th key={field} className="min-w-32 p-2">{field}</th>)}{LABEL_FIELDS.map((field) => <th key={field} className="min-w-40 p-2 align-top">{field}<p className="text-muted-foreground font-normal">{LABEL_OPTIONS[field]}</p></th>)}<th className="min-w-44 p-2">Status</th></tr></thead><tbody>{rows.map((row) => <WorklistRow key={row.id} row={row} sourceName={sourceStore.items.find((source) => source.id === row.sourceId)?.originalFilename ?? 'Existing data'} categories={categories} tableDefs={tableDefs} rawColumns={rawColumns(rows)} onChange={updateWorklist} ensureCategory={ensureCategory} />)}{rows.length === 0 && <tr><td colSpan={1 + DATA_FIELDS.length + LABEL_FIELDS.length} className="text-muted-foreground p-4 text-center">No staged data yet.</td></tr>}</tbody></table>
          </div>
          <div className="flex items-center gap-2 text-xs"><Input value={worklistFieldName} onChange={(event) => setWorklistFieldName(event.target.value)} placeholder="Add blank canonical field, e.g. quantity" className="h-7 w-60 text-xs" /><Button type="button" size="xs" variant="outline" onClick={() => void addWorklistField()} disabled={!worklistFieldName.trim()}><Plus className="size-3" />Add blank data field</Button></div>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <div className="text-xs"><p className="font-medium">Import data</p><p className="text-muted-foreground">Drop one or more CSV files here, or choose files.</p></div>
        <div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFiles(event.target.files)} /><Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><FilePlus2 className="size-3.5" />Import data</Button>{selectedSource ? <Button type="button" size="sm" disabled={!!validation?.errors.length} onClick={() => void saveAndStage()}><Upload className="size-3.5" />Add to imported unlabelled data</Button> : <Button type="button" size="sm" disabled={!rows.some((row) => row.status === 'ready')} onClick={() => void confirmPromotion()}><Check className="size-3.5" />Confirm and move ready rows</Button>}</div>
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
  return <tr className="border-t align-top"><td className="sticky left-0 bg-background p-2 font-medium">{sourceName}</td>{columns.map((column) => <td key={column} className="max-w-52 truncate p-2" title={row.rawValues[column] ?? ''}>{row.rawValues[column] ?? ''}</td>)}{DATA_FIELDS.map((field) => <td key={field} className="p-1"><EditableCell value={displayDataValue(field, row.mappedValues[field])} onCommit={(value) => saveData(field, value)} /></td>)}{LABEL_FIELDS.map((field) => <td key={field} className="p-1"><EditableCell value={labelValue(row, field, categories, tableDefs)} invalid={labelFieldInvalid(row, field, categories, tableDefs)} onCommit={(value) => void saveLabel(field, value)} /></td>)}<td className="max-w-56 p-2">{row.status === 'ready' ? <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300"><Check className="size-3" />Ready</span> : row.status}{row.validationErrors.length > 0 && <p className="mt-1 text-amber-600 dark:text-amber-300">{row.validationErrors[0]}</p>}</td></tr>
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
