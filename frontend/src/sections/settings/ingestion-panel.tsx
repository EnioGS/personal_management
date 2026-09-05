import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type UIEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleSlash2, FilePlus2, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColumnFilterMenu, type ColumnFilter } from '@/components/data-table/column-filter-menu'
import { ColumnSortMenu, type ColumnSort } from '@/components/data-table/column-sort-menu'
import { useMarkMode } from '@/components/data-table/use-mark-mode'
import { useProgressiveRows } from '@/components/data-table/use-progressive-rows'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { buildLabelCatalogue } from '@/lib/label-catalogue-source'
import { queryRows } from '@/lib/model/row-query'
import { DEFAULT_MEANING, ingestionLabelErrors } from '@/lib/model/ingestion'
import { parsePlacementLabels, resolveScreenLabel, resolveSectionLabel, screenLabelFor, sectionLabelFor, withDerivedSections, type LabelCatalogue } from '@/lib/model/label-catalogue'
import { applyLabelRulesToRows } from '@/lib/model/label-rules-repository'
import { setConfirmedMeaning } from '@/lib/model/confirmed-rows'
import { deleteMarked, toggleMark, type MarkableTable } from '@/lib/model/marking'
import { sourceRowsTable } from '@/lib/model/model-db'
import { useConfirmedRowsStore, useSourceFilesStore, useSourceRowsStore } from '@/lib/model/model-stores'
import {
  ASSIGNABLE_FIELDS,
  SOURCE_FILENAME_COLUMN,
  amountShapeOf,
  assignSourceColumns,
  confirmSourceRows,
  createSourceFile,
  planConfirmation,
  setSignConvention,
} from '@/lib/model/source-files'
import type { ConfirmedRow, IngestionRowLabels, IngestionTargetField, SourceFile, SourceRow } from '@/lib/model/types'
import { cn } from '@/lib/utils'
import { LabellingRules } from './labelling-rules'

const UNASSIGNED = '__unassigned__'
const NO_SELECTION = '__none__'

/** The label columns every table carries, in the order they are read. */
const LABEL_COLUMNS = ['sections', 'screens', 'category', 'subcategory'] as const
type LabelColumn = (typeof LABEL_COLUMNS)[number]

/** The two that are free text, never validated, and default rather than start empty. */
const MEANING_COLUMNS = ['category', 'subcategory'] as const

const LABEL_HINT: Record<LabelColumn, string> = {
  sections: "the app's sections — several allowed, separated by commas",
  screens: 'the screens inside those sections — several allowed',
  category: 'free text',
  subcategory: 'free text',
}

const CONFIRMED_COLUMNS = ['row_id', 'date', 'amount', 'category', 'subcategory', 'observations', 'source_filename'] as const

function confirmedTableKey(row: ConfirmedRow): string {
  return `${row.section}/${row.screen}`
}

function labelText(labels: IngestionRowLabels, column: LabelColumn, catalogue: LabelCatalogue): string {
  if (column === 'sections') return (labels.sections ?? []).map((id) => sectionLabelFor(catalogue, id)).join(', ')
  if (column === 'screens') return (labels.screens ?? []).map((id) => screenLabelFor(catalogue, id)).join(', ')
  return labels[column] ?? ''
}

/**
 * The Data ingestion centre.
 *
 * One phase: a file arrives as its own table, keeping every column it came with, and its
 * rows are labelled there. There is no waiting room between the file and the app — a row
 * is either still in the file it came from, or in the tables its labels name.
 */
export function IngestionPanel() {
  const { t } = useTranslation()
  const sourceFiles = useSourceFilesStore((store) => store.items)
  const sourceRows = useSourceRowsStore((store) => store.items)
  const confirmedRows = useConfirmedRowsStore((store) => store.items)
  const [selected, setSelected] = useState<string>(NO_SELECTION)
  const [message, setMessage] = useState<string | null>(null)
  const [isDropTarget, setIsDropTarget] = useState(false)
  const [sort, setSort] = useState<ColumnSort | null>(null)
  const [filters, setFilters] = useState<ColumnFilter[]>([])
  const [amountShape, setAmountShape] = useState<Awaited<ReturnType<typeof amountShapeOf>> | null>(null)
  // What is being typed in a label cell, before it is a label. A value nothing is called
  // is kept here and shown red rather than dropped, so a typo is visible instead of
  // silently discarded — and the row keeps the labels it already had until it is fixed.
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const fileInput = useRef<HTMLInputElement>(null)
  const catalogue = useMemo(() => buildLabelCatalogue((key) => String(t(key as never))), [t])
  const { marking, setMarking, rowProps } = useMarkMode()

  const confirmedTables = useMemo(
    () => [...new Set(confirmedRows.map(confirmedTableKey))].sort(),
    [confirmedRows],
  )
  const selectedFile = sourceFiles.find((file) => `source:${file.id}` === selected)
  const selectedConfirmed = selected.startsWith('confirmed:') ? selected.slice('confirmed:'.length) : null

  // A selection that disappears — the last file was confirmed away — must not leave the
  // screen pointing at nothing; the next thing there is is selected instead.
  useEffect(() => {
    if (selected !== NO_SELECTION && (selectedFile || selectedConfirmed)) return
    const next = sourceFiles[0] ? `source:${sourceFiles[0].id}` : confirmedTables[0] ? `confirmed:${confirmedTables[0]}` : NO_SELECTION
    if (next !== selected) setSelected(next)
  }, [confirmedTables, selected, selectedConfirmed, selectedFile, sourceFiles])

  useEffect(() => {
    if (!selectedFile) { setAmountShape(null); return }
    void amountShapeOf(selectedFile.id).then(setAmountShape).catch(() => setAmountShape(null))
  }, [selectedFile, sourceRows])

  const fileRows = useMemo(
    () => (selectedFile ? sourceRows.filter((row) => row.sourceId === selectedFile.id) : []),
    [selectedFile, sourceRows],
  )
  const tableRows = useMemo(
    () => (selectedConfirmed ? confirmedRows.filter((row) => confirmedTableKey(row) === selectedConfirmed) : []),
    [confirmedRows, selectedConfirmed],
  )

  async function importFiles(files: File[]) {
    // A table is a table whatever the extension says: a .txt of semicolon-separated rows
    // and a .md holding a pipe table are both read here.
    const readable = files.filter((file) => /\.(csv|txt|md)$/i.test(file.name))
    if (readable.length === 0) { setMessage('Import a .csv, .txt or .md file — anything holding a header row and rows under it.'); return }
    let firstId: number | null = null
    const failed: string[] = []
    for (const file of readable) {
      try {
        const id = await createSourceFile(file.name, await file.text())
        firstId ??= id
      } catch (error) {
        failed.push(`${file.name}: ${error instanceof Error ? error.message : 'could not be read'}`)
      }
    }
    // Source rules run at upload, which is what lets a file land already labelled.
    const applied = await applyLabelRulesToRows('source', (key) => String(t(key as never)))
    await refreshAllLocalStores()
    if (firstId !== null) setSelected(`source:${firstId}`)
    setMessage([
      `Imported ${readable.length - failed.length} file(s); ${applied.rowsTouched} row(s) labelled by standing rules.`,
      ...failed,
    ].join(' '))
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])]
    event.target.value = ''
    void importFiles(files)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDropTarget(false)
    void importFiles([...event.dataTransfer.files])
  }

  async function assign(column: string, target: string) {
    if (!selectedFile) return
    try {
      await assignSourceColumns(selectedFile.id, { [column]: target === UNASSIGNED ? null : (target as IngestionTargetField) })
      await refreshAllLocalStores()
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  /** What a cell's text resolves to, and what in it nothing is called. Computed per keystroke. */
  function readLabelCell(row: StoredRow<SourceRow>, column: LabelColumn, value: string) {
    const labels: IngestionRowLabels = { ...row.labels }
    if (column === 'sections') {
      const parsed = parsePlacementLabels(value, (text) => resolveSectionLabel(catalogue, text))
      return { labels: { ...labels, sections: parsed.values }, unknown: parsed.unknown }
    }
    if (column === 'screens') {
      const parsed = parsePlacementLabels(value, (text) => resolveScreenLabel(catalogue, text, labels.sections))
      return { labels: withDerivedSections({ ...labels, screens: parsed.values }, catalogue), unknown: parsed.unknown }
    }
    return { labels: { ...labels, [column]: value }, unknown: [] as string[] }
  }

  async function editLabel(row: StoredRow<SourceRow>, column: LabelColumn, value: string) {
    const { labels } = readLabelCell(row, column, value)
    await sourceRowsTable.update(row.id, { data: { ...stripStored(row), labels } satisfies SourceRow })
    await refreshAllLocalStores()
  }

  /** Category and subcategory are the labels §1.5 says may be added later, so they stay editable here. */
  async function editConfirmedMeaning(row: StoredRow<ConfirmedRow>, column: 'category' | 'subcategory', value: string) {
    await setConfirmedMeaning(row.id, { [column]: value.trim() || DEFAULT_MEANING })
  }

  async function removeMarked(table: MarkableTable) {
    const rows = (table === 'source' ? fileRows : tableRows).filter((row) => row.markedForElimination)
    if (rows.length === 0) { setMessage('Nothing is marked in this table.'); return }
    const deleted = await deleteMarked(table, rows.map((row) => row.id))
    setMarking(false)
    setMessage(`Deleted ${deleted} marked row(s). This cannot be undone.`)
  }

  async function confirm(discardMarked: boolean) {
    if (!selectedFile) return
    const plan = await planConfirmation(selectedFile.id, catalogue)
    const result = await confirmSourceRows(selectedFile.id, catalogue, { discardMarked })
    await refreshAllLocalStores()
    setMessage(
      `Confirmed ${result.confirmed} row(s) into ${result.copies} table copy/copies; `
      + `${result.leftBehind} left behind${discardMarked ? `, ${result.discarded} discarded` : ''}`
      + `${result.removedFile ? ', and the file is retired.' : `. ${plan.incomplete.length} row(s) still need labels.`}`,
    )
  }

  async function changeSignConvention(kind: SourceFile['signConvention']['kind']) {
    if (!selectedFile) return
    if (kind === 'invertWhen') {
      setMessage('Inverting by condition needs the column and the values that mean "out" — ask the assistant to set it.')
      return
    }
    await setSignConvention(selectedFile.id, { kind })
    await refreshAllLocalStores()
  }

  const visibleSourceRows = useMemo(() => {
    if (!sort && filters.length === 0) return fileRows
    return queryRows(fileRows, (row, field) => sourceCellValue(row, field, catalogue), { sort: sort ?? undefined, filters }).rows
  }, [catalogue, fileRows, filters, sort])
  const visibleConfirmedRows = useMemo(() => {
    if (!sort && filters.length === 0) return tableRows
    return queryRows(tableRows, (row, field) => (row as unknown as Record<string, unknown>)[field], { sort: sort ?? undefined, filters }).rows
  }, [filters, sort, tableRows])

  const windowKey = `${selected}:${sort?.field}:${sort?.direction}:${filters.length}`
  const sourceWindow = useProgressiveRows(visibleSourceRows, windowKey)
  const confirmedWindow = useProgressiveRows(visibleConfirmedRows, windowKey)

  return (
    <div
      className={cn('flex h-full flex-col gap-3 overflow-auto p-4', isDropTarget && 'bg-accent/40')}
      onDragOver={(event) => { event.preventDefault(); setIsDropTarget(true) }}
      onDragLeave={() => setIsDropTarget(false)}
      onDrop={handleDrop}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="h-8 w-[22rem] text-xs">
            <SelectValue placeholder="Nothing imported yet" />
          </SelectTrigger>
          <SelectContent className="text-xs">
            {sourceFiles.length === 0 && confirmedTables.length === 0 && (
              <SelectItem value={NO_SELECTION}>Nothing imported yet</SelectItem>
            )}
            {sourceFiles.map((file) => (
              <SelectItem key={file.id} value={`source:${file.id}`}>
                {`${file.originalFilename} — ${sourceRows.filter((row) => row.sourceId === file.id).length} row(s)`}
              </SelectItem>
            ))}
            {confirmedTables.map((table) => (
              <SelectItem key={table} value={`confirmed:${table}`}>
                {`${sectionLabelFor(catalogue, table.split('/')[0])} · ${screenLabelFor(catalogue, table.split('/')[1])}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <input ref={fileInput} type="file" accept=".csv,.txt,.md" multiple className="hidden" onChange={handleFileInput} />
        <Button type="button" size="xs" variant="outline" onClick={() => fileInput.current?.click()}>
          <Upload className="mr-1 size-3.5" /> Import a file
        </Button>
      </div>

      {selectedFile && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Signs:</span>
          {(['asImported', 'invertAll'] as const).map((kind) => (
            <Button
              key={kind}
              type="button"
              size="xs"
              variant={selectedFile.signConvention.kind === kind ? 'secondary' : 'outline'}
              onClick={() => void changeSignConvention(kind)}
            >
              {kind === 'asImported' ? 'as the file wrote them' : 'inverted'}
            </Button>
          ))}
          {amountShape?.shape && (
            <span className="text-muted-foreground">
              {`${amountShape.amountColumn}: ${amountShape.shape.negatives} negative, ${amountShape.shape.positives} positive `}
              {`(${amountShape.shape.min} … ${amountShape.shape.max})`}
            </span>
          )}
        </div>
      )}

      {selectedFile?.looksLikeSourceId !== undefined && (
        <p className="text-destructive rounded-md border border-dashed p-2 text-xs">
          {`This file's name is very close to "${sourceFiles.find((file) => file.id === selectedFile.looksLikeSourceId)?.originalFilename ?? 'an earlier import'}" — it may be the same export downloaded twice. Its rows were compared against that one first.`}
        </p>
      )}

      {message && <p className="bg-muted rounded-md p-2 text-xs">{message}</p>}

      {selectedFile && (
        <TableFrame
          marking={marking}
          onToggleMarking={() => setMarking(!marking)}
          onDeleteMarked={() => void removeMarked('source')}
          markedCount={fileRows.filter((row) => row.markedForElimination).length}
          summary={`${sourceWindow.shown} of ${sourceWindow.total} row(s)`}
          onScroll={sourceWindow.onScroll}
          actions={
            <>
              <Button type="button" size="xs" variant="outline" onClick={() => void confirm(false)}>
                <FilePlus2 className="mr-1 size-3.5" /> Import new values
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={() => void confirm(true)}>
                Import and discard
              </Button>
            </>
          }
        >
          <table className="w-full text-xs">
            <thead className="bg-muted/60 sticky top-0">
              {/* Assignment sits on a line of its own above the names: it is a statement
                  about the column, not part of what the column is called. */}
              <tr>
                <th colSpan={3} className="px-2 pt-2" />
                {selectedFile.originalColumns.map((column) => (
                  <th key={column} className="px-2 pt-2 text-left font-normal">
                    <Select value={selectedFile.assignments[column] ?? UNASSIGNED} onValueChange={(value) => void assign(column, value)}>
                      <SelectTrigger className="h-6 w-36 text-[10px]"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-xs">
                        <SelectItem value={UNASSIGNED}>— unassigned —</SelectItem>
                        {ASSIGNABLE_FIELDS.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </th>
                ))}
                <th colSpan={LABEL_COLUMNS.length} className="px-2 pt-2" />
              </tr>
              <tr>
                <th className="p-2 text-left font-medium">{SOURCE_FILENAME_COLUMN}</th>
                <th className="p-2 text-left font-medium">row_id</th>
                <th className="p-2 text-left font-medium">duplicate?</th>
                {selectedFile.originalColumns.map((column) => (
                  <th key={column} className="p-2 text-left font-medium">
                    <span className="flex items-center gap-1">
                      <ColumnSortMenu field={column} label={column} sort={sort} onSort={setSort} />
                      <ColumnFilterMenu field={column} label={column} filters={filters} onChange={setFilters} />
                    </span>
                  </th>
                ))}
                {LABEL_COLUMNS.map((column) => (
                  <th key={column} className="p-2 text-left font-medium" title={LABEL_HINT[column]}>
                    <span className="flex items-center gap-1">
                      <ColumnSortMenu field={column} label={column} sort={sort} onSort={setSort} />
                      <ColumnFilterMenu field={column} label={column} filters={filters} onChange={setFilters} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sourceWindow.visible.map((row) => {
                // What still stands between this row and a table, said in words rather
                // than only in colour.
                const errors = ingestionLabelErrors(row.labels, catalogue)
                return (
                  <tr
                    key={row.id}
                    {...rowProps(() => void toggleMark('source', row.id))}
                    className={cn(
                      'border-b last:border-0',
                      marking && 'cursor-pointer',
                      row.markedForElimination && 'bg-destructive/10 line-through',
                    )}
                  >
                    <td className="text-muted-foreground p-2 whitespace-nowrap" title={errors.join(' ')}>{row.values[SOURCE_FILENAME_COLUMN]}</td>
                    <td className="text-muted-foreground p-2 font-mono whitespace-nowrap" title="Fixed at import; every copy this row is confirmed into keeps it.">{row.rowId}</td>
                    <td className="p-2 whitespace-nowrap" title={row.duplicateOf ? `Matches ${row.duplicateOf}, which came from another file.` : undefined}>
                      {row.duplicateOf ? <span className="text-destructive">duplicate?</span> : ''}
                    </td>
                    {selectedFile.originalColumns.map((column) => (
                      <td key={column} className="p-2" title={selectedFile.assignments[column] === 'amount' && row.importedAmount !== undefined ? `The file wrote ${row.importedAmount}` : undefined}>
                        {row.values[column]}
                      </td>
                    ))}
                    {LABEL_COLUMNS.map((column) => {
                      const key = `${row.id}:${column}`
                      const typed = drafts[key]
                      const text = typed ?? labelText(row.labels, column, catalogue)
                      const unknown = typed === undefined ? [] : readLabelCell(row, column, typed).unknown
                      const missing = MEANING_COLUMNS.includes(column as never) ? false : (row.labels[column] ?? []).length === 0
                      return (
                        <td key={column} className="p-2">
                          <Input
                            value={text}
                            title={unknown.length > 0 ? `Nothing is called ${unknown.join(', ')}.` : undefined}
                            onChange={(event) => setDrafts((current) => ({ ...current, [key]: event.target.value }))}
                            onBlur={(event) => {
                              void editLabel(row, column, event.target.value)
                              // The text stays on screen while it names nothing, so the mistake
                              // is visible; once it resolves, the stored labels take over.
                              if (unknown.length === 0) setDrafts(({ [key]: _cleared, ...rest }) => rest)
                            }}
                            className={cn(
                              'h-6 w-36 text-[11px]',
                              unknown.length > 0 && 'border-destructive text-destructive',
                              unknown.length === 0 && missing && 'border-amber-500',
                            )}
                          />
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TableFrame>
      )}

      {selectedConfirmed && (
        <TableFrame
          marking={marking}
          onToggleMarking={() => setMarking(!marking)}
          onDeleteMarked={() => void removeMarked('confirmed')}
          markedCount={tableRows.filter((row) => row.markedForElimination).length}
          summary={`${confirmedWindow.shown} of ${confirmedWindow.total} row(s)`}
          onScroll={confirmedWindow.onScroll}
        >
          <table className="w-full text-xs">
            <thead className="bg-muted/60 sticky top-0">
              <tr>
                {CONFIRMED_COLUMNS.map((column) => (
                  <th key={column} className="p-2 text-left font-medium">
                    <span className="flex items-center gap-1">
                      <ColumnSortMenu field={confirmedField(column)} label={column} sort={sort} onSort={setSort} />
                      <ColumnFilterMenu field={confirmedField(column)} label={column} filters={filters} onChange={setFilters} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {confirmedWindow.visible.map((row) => (
                <tr
                  key={row.id}
                  {...rowProps(() => void toggleMark('confirmed', row.id))}
                  className={cn(
                    'border-b last:border-0',
                    marking && 'cursor-pointer',
                    row.markedForElimination && 'bg-destructive/10 line-through',
                  )}
                >
                  <td className="text-muted-foreground p-2 font-mono whitespace-nowrap" title="The id every copy of this row shares, fixed for its life.">{row.rowId}</td>
                  <td className="p-2 whitespace-nowrap">{row.date ? new Date(row.date).toISOString().slice(0, 10) : ''}</td>
                  <td className="p-2 text-right tabular-nums">{row.amount ?? ''}</td>
                  {(['category', 'subcategory'] as const).map((column) => (
                    <td key={column} className="p-2">
                      <Input
                        defaultValue={row[column]}
                        onBlur={(event) => void editConfirmedMeaning(row, column, event.target.value)}
                        className="h-6 w-32 text-[11px]"
                      />
                    </td>
                  ))}
                  <td className="text-muted-foreground max-w-[28rem] truncate p-2" title={row.observations}>{row.observations}</td>
                  <td className="text-muted-foreground p-2 whitespace-nowrap">{row.sourceFilename}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}

      {/* §1.6.1: the rules of a stage are shown only while a table of that stage is
          selected — set apart below the table, because it is a different subject. */}
      {(selectedFile || selectedConfirmed) && (
        <div className="mt-8 border-t pt-6">
          {selectedFile && <LabellingRules context="source" />}
          {selectedConfirmed && <LabellingRules context="confirmed" />}
        </div>
      )}
    </div>
  )
}

/**
 * A table and the controls that belong to it.
 *
 * Marking rows and deleting the marked ones are part of a table, not of the page: they
 * act on these rows and nothing else, so they sit against its edges — above it and below
 * it, since a table long enough to scroll would otherwise leave them off screen. The
 * marking button stays pressed while the mode is on, which is the only honest way to show
 * a mode that changes what a click does.
 */
function TableFrame({
  marking,
  onToggleMarking,
  onDeleteMarked,
  markedCount,
  summary,
  onScroll,
  actions,
  children,
}: {
  marking: boolean
  onToggleMarking: () => void
  onDeleteMarked: () => void
  markedCount: number
  summary: string
  onScroll: (event: UIEvent<HTMLElement>) => void
  actions?: ReactNode
  children: ReactNode
}) {
  const controls = (
    <>
      <Button
        type="button"
        size="xs"
        variant={marking ? 'secondary' : 'ghost'}
        aria-pressed={marking}
        data-mark-toggle
        className={cn(marking && 'ring-ring ring-1')}
        onClick={onToggleMarking}
      >
        <CircleSlash2 className="mr-1 size-3.5" /> Mark for elimination
      </Button>
      <Button type="button" size="xs" variant="ghost" className="text-destructive" onClick={onDeleteMarked}>
        <Trash2 className="mr-1 size-3.5" /> {markedCount > 0 ? `Delete ${markedCount} marked line(s)` : 'Delete marked lines'}
      </Button>
    </>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md border">
      <div className="bg-muted/40 flex flex-wrap items-center justify-end gap-1 border-b px-2 py-1">{controls}</div>
      <div className="min-h-0 flex-1 overflow-auto" onScroll={onScroll}>{children}</div>
      <div className="bg-muted/40 flex flex-wrap items-center justify-end gap-1 border-t px-2 py-1">
        <span className="text-muted-foreground mr-auto text-xs">{summary}</span>
        {controls}
        {actions}
      </div>
    </div>
  )
}

/** The stored row without the metadata the table keeps for itself. */
function stripStored<T>(row: StoredRow<T>): T {
  const { id, createdAt, ...rest } = row as StoredRow<T> & Record<string, unknown>
  void id
  void createdAt
  return rest as T
}

/** The confirmed columns are shown snake_case, the way SQL sees them; sorting reads the stored field. */
function confirmedField(column: string): string {
  if (column === 'source_filename') return 'sourceFilename'
  if (column === 'row_id') return 'rowId'
  return column
}

function sourceCellValue(row: StoredRow<SourceRow>, field: string, catalogue: LabelCatalogue): unknown {
  if ((LABEL_COLUMNS as readonly string[]).includes(field)) return labelText(row.labels, field as LabelColumn, catalogue)
  if (field === SOURCE_FILENAME_COLUMN) return row.values[SOURCE_FILENAME_COLUMN]
  if (field === 'row_id') return row.rowId
  return row.values[field]
}
