import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { FilePlus2, Plus, Upload } from 'lucide-react'
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
import {
  useIngestionColumnMappingsStore,
  useIngestionRowsStore,
  useIngestionSourcesStore,
} from '@/lib/model/model-stores'
import type { IngestionColumnMapping, IngestionTargetField } from '@/lib/model/types'

const TARGET_FIELDS: IngestionTargetField[] = [
  'date', 'amount', 'description', 'rawCategory', 'direction', 'asset', 'investmentType', 'quantity', 'price', 'note', 'destination',
  'financeDestinations', 'flowRole', 'settlementChannel', 'spendingTreatment', 'categoryId', 'recurrence', 'destinationTableId',
]

const UNLABELLED_DATASET = '__unlabelled__'

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
  const [selected, setSelected] = useState(UNLABELLED_DATASET)
  const [draftMappings, setDraftMappings] = useState<IngestionColumnMapping[] | null>(null)
  const [supplementalName, setSupplementalName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
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
        <section className="min-h-0 flex-1 overflow-auto rounded-md border">
          <table className="min-w-full text-left text-xs"><thead className="bg-muted/30"><tr><th className="p-2">Source</th><th className="p-2">Raw values</th><th className="p-2">Labels</th><th className="p-2">Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t"><td className="p-2">{sourceStore.items.find((source) => source.id === row.sourceId)?.originalFilename ?? 'Existing data'}</td><td className="max-w-96 truncate p-2 font-mono" title={JSON.stringify(row.rawValues)}>{JSON.stringify(row.rawValues)}</td><td className="max-w-80 truncate p-2">{JSON.stringify(row.labels)}</td><td className="p-2">{row.status}</td></tr>)}{rows.length === 0 && <tr><td colSpan={4} className="text-muted-foreground p-4 text-center">No staged data yet.</td></tr>}</tbody></table>
        </section>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <div className="text-xs"><p className="font-medium">Import data</p><p className="text-muted-foreground">Drop one or more CSV files here, or choose files.</p></div>
        <div className="flex gap-2"><input ref={fileInput} type="file" accept=".csv,text/csv" multiple className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => void handleFiles(event.target.files)} /><Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}><FilePlus2 className="size-3.5" />Import data</Button>{selectedSource && <Button type="button" size="sm" disabled={!!validation?.errors.length} onClick={() => void saveAndStage()}><Upload className="size-3.5" />Add to imported unlabelled data</Button>}</div>
      </div>
    </div>
  )
}
