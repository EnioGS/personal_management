import { useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode, type UIEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleSlash2, FileMinus2, FilePlus2, Plus, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ColumnFilterMenu, type ColumnFilter } from '@/components/data-table/column-filter-menu'
import { EditableCell } from '@/components/data-table/editable-cell'
import { ColumnSortMenu, type ColumnSort } from '@/components/data-table/column-sort-menu'
import { useMarkMode } from '@/components/data-table/use-mark-mode'
import { useProgressiveRows } from '@/components/data-table/use-progressive-rows'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { buildLabelCatalogue } from '@/lib/label-catalogue-source'
import { queryRows } from '@/lib/model/row-query'
import { ingestionLabelErrors } from '@/lib/model/ingestion'
import { parsePlacementLabels, resolveAccountLabel, resolveCardLabel, resolveScreenLabel, resolveSectionLabel, screenLabelFor, sectionLabelFor, withDerivedSections, type LabelCatalogue } from '@/lib/model/label-catalogue'
import { applyLabelRulesToRows } from '@/lib/model/label-rules-repository'
import { addConfirmedRow, placeConfirmedRow, updateConfirmedRow, type ConfirmedEditableColumn } from '@/lib/model/confirmed-rows'
import { deleteMarked, toggleMark, type MarkableTable } from '@/lib/model/marking'
import { sourceRowsTable } from '@/lib/model/model-db'
import { useAccountsStore, useCardsStore, useConfirmedRowsStore, useSourceFilesStore, useSourceRowsStore } from '@/lib/model/model-stores'
import {
  ASSIGNABLE_FIELDS,
  SOURCE_FILENAME_COLUMN,
  addSourceRow,
  amountShapeOf,
  assignSourceColumns,
  confirmSourceRows,
  createSourceFile,
  planConfirmation,
  retireEmptySourceFiles,
  setSignConvention,
  updateSourceValue,
} from '@/lib/model/source-files'
import type { ConfirmedRow, IngestionRowLabels, IngestionTargetField, SourceFile, SourceRow } from '@/lib/model/types'
import { cn } from '@/lib/utils'
import { ClassificationNotes } from './classification-notes'
import { LabellingRules } from './labelling-rules'

const UNASSIGNED = '__unassigned__'
const NO_SELECTION = '__none__'

/** The label columns every table carries, in the order they are read. */
const LABEL_COLUMNS = ['account', 'card', 'sections', 'screens', 'category', 'subcategory'] as const
type LabelColumn = (typeof LABEL_COLUMNS)[number]

/** The ones that are free text, never validated, and default rather than start empty. */
const MEANING_COLUMNS = ['category', 'subcategory'] as const

/** Card is the one placement label a row may honestly leave empty — not every row has one. */
const OPTIONAL_COLUMNS = ['card'] as const

const LABEL_HINT: Record<LabelColumn, string> = {
  account: 'one of your accounts, by the name it was set up under',
  card: 'one of your credit cards — empty when the row never touched one',
  sections: "the app's sections — several allowed, separated by commas",
  screens: 'the screens inside those sections — several allowed',
  category: 'free text',
  subcategory: 'free text',
}

const CONFIRMED_COLUMNS = ['row_id', 'section', 'screen', 'date', 'amount', 'account', 'card', 'category', 'subcategory', 'observations'] as const

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
  const accounts = useAccountsStore((store) => store.items)
  const cards = useCardsStore((store) => store.items)
  // Accounts and cards are label vocabulary now, so the catalogue is rebuilt when the
  // user adds one — a name set up in Settings is a valid label the moment it exists.
  const catalogue = useMemo(
    () => buildLabelCatalogue((key) => String(t(key as never)), {
      accounts: accounts.filter((account) => !account.archived).map((account) => account.name),
      cards: cards.filter((card) => !card.archived).map((card) => card.name),
    }),
    [accounts, cards, t],
  )
  const { marking, setMarking, rowProps } = useMarkMode()

  // Every table a screen could hold, whether or not anything is in it yet: a table with
  // no rows is still where rows for that screen go, and being unable to open it means
  // being unable to add the first one.
  const confirmedTables = useMemo(() => {
    const fromApp = catalogue.screens.map((screen) => `${screen.sectionId}/${screen.id}`)
    const fromRows = confirmedRows.map(confirmedTableKey)
    return [...new Set([...fromApp, ...fromRows])].sort()
  }, [catalogue, confirmedRows])
  const selectedFile = sourceFiles.find((file) => `source:${file.id}` === selected)
  const selectedConfirmed = selected.startsWith('confirmed:') ? selected.slice('confirmed:'.length) : null

  // A selection that disappears — the last file was confirmed away — must not leave the
  // screen pointing at nothing; the next thing there is is selected instead.
  useEffect(() => {
    if (selected !== NO_SELECTION && (selectedFile || selectedConfirmed)) return
    const next = sourceFiles[0] ? `source:${sourceFiles[0].id}` : confirmedTables[0] ? `confirmed:${confirmedTables[0]}` : NO_SELECTION
    if (next !== selected) setSelected(next)
  }, [confirmedTables, selected, selectedConfirmed, selectedFile, sourceFiles])

  // Anything left empty by an earlier session goes when the screen opens: a file table
  // with no rows in it has nothing to do.
  useEffect(() => {
    void retireEmptySourceFiles().then((retired) => { if (retired > 0) void refreshAllLocalStores() })
  }, [])

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
    if (column === 'account' || column === 'card') {
      const text = value.trim()
      const resolved = column === 'account' ? resolveAccountLabel(catalogue, text) : resolveCardLabel(catalogue, text)
      // Empty is a real answer here: not every row belongs to an account or a card.
      if (!text) return { labels: { ...labels, [column]: undefined }, unknown: [] as string[] }
      return { labels: { ...labels, [column]: resolved }, unknown: resolved ? [] : [text] }
    }
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

  async function editSourceValue(row: StoredRow<SourceRow>, column: string, value: string) {
    try {
      await updateSourceValue(row.id, column, value)
      await refreshAllLocalStores()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    }
  }

  async function editConfirmed(row: StoredRow<ConfirmedRow>, column: ConfirmedEditableColumn, value: string) {
    await updateConfirmedRow(row.id, column, value)
  }

  /**
   * Re-placing a confirmed row. Which table it is in is its section and screen, so editing
   * either of them moves it — the row leaves this table and appears in the one it now
   * names, keeping the id every copy of it shares.
   */
  async function editPlacement(row: StoredRow<ConfirmedRow>, column: 'section' | 'screen', value: string) {
    const section = column === 'section' ? resolveSectionLabel(catalogue, value) : row.section
    const screen = column === 'screen' ? resolveScreenLabel(catalogue, value, section ? [section] : undefined) : row.screen
    if (!section || !screen) { setMessage(`Nothing is called ${value}.`); return }
    await placeConfirmedRow(row.id, { section, screen })
    setMessage(`Moved row ${row.rowId} to ${sectionLabelFor(catalogue, section)} · ${screenLabelFor(catalogue, screen)}.`)
  }

  async function addLine() {
    if (selectedFile) await addSourceRow(selectedFile.id)
    else if (selectedConfirmed) await addConfirmedRow(selectedConfirmed.split('/')[0], selectedConfirmed.split('/')[1])
    await refreshAllLocalStores()
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
      className={cn('scrollbar-hidden flex h-full flex-col gap-3 overflow-auto p-4', isDropTarget && 'bg-accent/40')}
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
          onAddLine={() => void addLine()}
          markedCount={fileRows.filter((row) => row.markedForElimination).length}
          summary={`${sourceWindow.shown} of ${sourceWindow.total} row(s)`}
          onScroll={sourceWindow.onScroll}
          actions={
            <>
              <Button type="button" size="xs" variant="outline" onClick={() => void confirm(false)}>
                <FilePlus2 className="mr-1 size-3.5" /> Import new values
              </Button>
              <Button type="button" size="xs" variant="outline" onClick={() => void confirm(true)} title="Confirms what is ready, throws away what is marked for elimination, and retires the file.">
                <FileMinus2 className="mr-1 size-3.5" /> Import and discard
              </Button>
            </>
          }
        >
          <table className="w-full text-xs">
            {/* The head paints itself per row rather than as a block: the assignment line
                belongs to the strip of controls above it and wears that same background,
                while the names below carry the heavier one. Both are on the cells, since
                a sticky head must not be see-through. */}
            <thead className="sticky top-0">
              {/* Assignment sits on a line of its own above the names: it is a statement
                  about the column, not part of what the column is called. */}
              <tr className="[&>th]:bg-muted/40">
                <th colSpan={3} className="px-2 py-1" />
                {selectedFile.originalColumns.map((column) => (
                  <th key={column} className="px-2 py-1 text-left font-normal">
                    <Select value={selectedFile.assignments[column] ?? UNASSIGNED} onValueChange={(value) => void assign(column, value)}>
                      <SelectTrigger size="sm" className="h-5 w-36 gap-1 px-1.5 py-0 text-[10px] [&>svg]:size-3"><SelectValue /></SelectTrigger>
                      <SelectContent className="text-xs">
                        <SelectItem value={UNASSIGNED}>— unassigned —</SelectItem>
                        {ASSIGNABLE_FIELDS.map((field) => <SelectItem key={field} value={field}>{field}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </th>
                ))}
                <th colSpan={LABEL_COLUMNS.length} className="px-2 py-1" />
              </tr>
              <tr className="[&>th]:bg-muted">
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
                      <EditableCell
                        key={column}
                        value={row.values[column] ?? ''}
                        disabled={marking}
                        title={selectedFile.assignments[column] === 'amount' && row.importedAmount !== undefined ? `The file wrote ${row.importedAmount}` : undefined}
                        onCommit={(value) => void editSourceValue(row, column, value)}
                      />
                    ))}
                    {LABEL_COLUMNS.map((column) => {
                      const key = `${row.id}:${column}`
                      const text = drafts[key] ?? labelText(row.labels, column, catalogue)
                      // Category and subcategory always hold something, and a card is
                      // genuinely optional; the rest are required and say so until filled.
                      const optional = MEANING_COLUMNS.includes(column as never) || OPTIONAL_COLUMNS.includes(column as never)
                      const missing = optional ? false : (row.labels[column] ?? []).length === 0
                      return (
                        <EditableCell
                          key={column}
                          value={text}
                          disabled={marking}
                          missing={missing}
                          validate={(draft) => {
                            const unknown = readLabelCell(row, column, draft).unknown
                            return unknown.length > 0 ? `Nothing is called ${unknown.join(', ')}.` : null
                          }}
                          onCommit={(value) => {
                            void editLabel(row, column, value)
                            // What was typed stays on screen while it names nothing, so the
                            // mistake is visible; once it resolves, the labels take over.
                            const unknown = readLabelCell(row, column, value).unknown
                            setDrafts((current) => {
                              const next = { ...current }
                              if (unknown.length > 0) next[key] = value
                              else delete next[key]
                              return next
                            })
                          }}
                        />
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
          onAddLine={() => void addLine()}
          markedCount={tableRows.filter((row) => row.markedForElimination).length}
          summary={`${confirmedWindow.shown} of ${confirmedWindow.total} row(s)`}
          onScroll={confirmedWindow.onScroll}
        >
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="[&>th]:bg-muted">
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
                  {(['section', 'screen'] as const).map((column) => (
                    <EditableCell
                      key={column}
                      value={column === 'section' ? sectionLabelFor(catalogue, row.section) : screenLabelFor(catalogue, row.screen)}
                      disabled={marking}
                      title="Which table this row is in. Change it and the row moves there."
                      validate={(draft) => {
                        const section = column === 'section' ? resolveSectionLabel(catalogue, draft) : row.section
                        const resolved = column === 'section'
                          ? section
                          : resolveScreenLabel(catalogue, draft, section ? [section] : undefined)
                        return resolved ? null : `Nothing is called ${draft}.`
                      }}
                      onCommit={(value) => void editPlacement(row, column, value)}
                    />
                  ))}
                  <EditableCell
                    className="whitespace-nowrap"
                    value={row.date ? new Date(row.date).toISOString().slice(0, 10) : ''}
                    disabled={marking}
                    onCommit={(value) => void editConfirmed(row, 'date', value)}
                  />
                  <EditableCell
                    className="tabular-nums"
                    value={row.amount === undefined ? '' : String(row.amount)}
                    disabled={marking}
                    onCommit={(value) => void editConfirmed(row, 'amount', value)}
                  />
                  {(['account', 'card'] as const).map((column) => (
                    <EditableCell
                      key={column}
                      value={row[column] ?? ''}
                      disabled={marking}
                      validate={(draft) => {
                        const text = draft.trim()
                        if (!text) return null
                        const resolved = column === 'account' ? resolveAccountLabel(catalogue, text) : resolveCardLabel(catalogue, text)
                        return resolved ? null : `No ${column} is called ${text}. Set it up in Settings → General.`
                      }}
                      onCommit={(value) => void editConfirmed(row, column, value)}
                    />
                  ))}
                  {(['category', 'subcategory'] as const).map((column) => (
                    <EditableCell key={column} value={row[column]} disabled={marking} onCommit={(value) => void editConfirmed(row, column, value)} />
                  ))}
                  <EditableCell
                    className="max-w-[28rem] truncate"
                    value={row.observations}
                    disabled={marking}
                    onCommit={(value) => void editConfirmed(row, 'observations', value)}
                  />
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )}

      {/* §1.6.1: the rules of a stage are shown only while a table of that stage is
          selected — set apart below the table, because it is a different subject. */}
      {/* The table is the screen: it takes the height, and what is written about the
          labelling waits a scroll away rather than competing with the rows. */}
      {(selectedFile || selectedConfirmed) && (
        <>
          <div className="mt-[2.25rem] border-t pt-6">
            {selectedFile && <LabellingRules context="source" />}
            {selectedConfirmed && <LabellingRules context="confirmed" />}
          </div>
          {/* Below the rules, and separate from them: what a rule cannot say. */}
          <div className="mt-[2.25rem] border-t pt-6 pb-6">
            <ClassificationNotes context={selectedConfirmed ? 'confirmed' : 'source'} />
          </div>
        </>
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
  onAddLine,
  markedCount,
  summary,
  onScroll,
  actions,
  children,
}: {
  marking: boolean
  onToggleMarking: () => void
  onDeleteMarked: () => void
  onAddLine: () => void
  markedCount: number
  summary: string
  onScroll: (event: UIEvent<HTMLElement>) => void
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    // Tall by measure rather than by what is in it: an empty table and a full one both
    // hold the screen, and what is written below stays a scroll away in either case.
    <div className="flex min-h-[72vh] flex-1 flex-col rounded-md border">
      <div className="bg-muted/40 flex flex-wrap items-center justify-end gap-1 border-b px-2 py-1">
        <Button type="button" size="xs" variant="ghost" onClick={onAddLine}>
          <Plus className="mr-1 size-3.5" /> Add a line
        </Button>
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
      </div>
      <div className="min-h-0 flex-1 overflow-auto" onScroll={onScroll}>{children}</div>
      <div className="bg-muted/40 flex flex-wrap items-center justify-end gap-1 border-t px-2 py-1">
        <span className="text-muted-foreground mr-auto text-xs">{summary}</span>
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
  return column === 'row_id' ? 'rowId' : column
}

function sourceCellValue(row: StoredRow<SourceRow>, field: string, catalogue: LabelCatalogue): unknown {
  if ((LABEL_COLUMNS as readonly string[]).includes(field)) return labelText(row.labels, field as LabelColumn, catalogue)
  if (field === SOURCE_FILENAME_COLUMN) return row.values[SOURCE_FILENAME_COLUMN]
  if (field === 'row_id') return row.rowId
  return row.values[field]
}
