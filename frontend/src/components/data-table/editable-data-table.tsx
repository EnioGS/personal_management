import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef as TanstackColumnDef } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ComboboxInput } from './combobox-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { coerceValue } from '@/lib/csv'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { ColumnDef, TableSchema } from '@/lib/table-schema'

/** Idle time after the last edit before a complete draft row auto-commits (see below). */
const COMMIT_DEBOUNCE_MS = 500

interface EditableDataTableProps<T extends Record<string, unknown>> {
  schema: TableSchema<T>
  rows: StoredRow<T>[]
  onAddRow: (row: T) => void
  /** Persist one edited field on an existing row. */
  onUpdateRow: (id: number, changes: Partial<T>) => void
  onDeleteRow: (id: number) => void
  /** Rendered above the table (e.g. CSV export/import buttons). */
  actions?: ReactNode
}

/** date/number/select/combobox are always mandatory; 'text' is optional unless marked required. */
function isColumnRequired<T>(col: ColumnDef<T>): boolean {
  return col.type !== 'text' || !!col.required
}

export function EditableDataTable<T extends Record<string, unknown>>({
  schema,
  rows,
  onAddRow,
  onUpdateRow,
  onDeleteRow,
  actions,
}: EditableDataTableProps<T>) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Record<string, string>>({})

  // Per-field validity of what's currently typed in the draft row — used only to flag
  // an invalid value (e.g. a malformed date) visually; an empty, not-yet-filled field is
  // "incomplete", not "invalid", and gets no error styling.
  const draftErrors = useMemo(() => {
    const errors: Record<string, boolean> = {}
    for (const col of schema) {
      const key = String(col.key)
      const raw = (draft[key] ?? '').trim()
      if (!raw) continue
      errors[key] = !coerceValue(col, raw).ok
    }
    return errors
  }, [draft, schema])

  // Suggestions for open-vocabulary columns: the schema's seed values plus everything
  // already used in this table, so a category typed (or imported) once is offered from
  // then on without anyone having to register it anywhere.
  const suggestionsByColumn = useMemo(() => {
    const byColumn: Record<string, string[]> = {}
    for (const col of schema) {
      if (col.type !== 'combobox') continue
      const used = rows
        .map((row) => row[col.key] as unknown)
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      byColumn[String(col.key)] = [...new Set([...(col.options ?? []), ...used])].sort((a, b) => a.localeCompare(b))
    }
    return byColumn
  }, [schema, rows])

  const columns = useMemo<TanstackColumnDef<StoredRow<T>>[]>(
    () => [
      ...schema.map((col) => ({
        id: String(col.key),
        accessorFn: (row: StoredRow<T>) => row[col.key],
        header: () => t(col.labelKey as never),
        cell: ({ getValue, row }: { getValue: () => unknown; row: { original: StoredRow<T> } }) => (
          <ExistingRowCell
            col={col}
            value={getValue()}
            label={t(col.labelKey as never)}
            suggestions={suggestionsByColumn[String(col.key)] ?? []}
            onCommit={(value) => onUpdateRow(row.original.id, { [col.key]: value } as Partial<T>)}
          />
        ),
      })),
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }: { row: { original: StoredRow<T> } }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={t('table.delete')}
            onClick={() => onDeleteRow(row.original.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        ),
      },
    ],
    [schema, t, onDeleteRow, onUpdateRow, suggestionsByColumn],
  )

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  function updateDraftField(key: string, value: string) {
    setDraft((d) => ({ ...d, [key]: value }))
  }

  /** Builds a row from the draft, or returns null if any column is missing or invalid. */
  function buildRowFromDraft(): T | null {
    const row: Partial<T> = {}
    for (const col of schema) {
      const raw = (draft[String(col.key)] ?? '').trim()
      if (!raw) {
        if (isColumnRequired(col)) return null
        row[col.key] = '' as T[keyof T]
        continue
      }
      const result = coerceValue(col, raw)
      if (!result.ok) return null
      row[col.key] = result.value as T[keyof T]
    }
    return row as T
  }

  // The draft row promotes itself into a real row the moment every required column has
  // held a valid value for COMMIT_DEBOUNCE_MS — there's no separate "confirm" step, and
  // no dependency on focus/blur (a dropdown's popup isn't a DOM descendant of the row, so
  // that wouldn't work reliably for the 'select' cells below). The debounce is what keeps
  // this from firing mid-keystroke: typing "1" then "0" into an amount field would
  // otherwise commit after the very first, already-numeric digit.
  useEffect(() => {
    const timer = setTimeout(() => {
      const row = buildRowFromDraft()
      if (!row) return
      onAddRow(row)
      setDraft({})
    }, COMMIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // Deliberately keyed on `draft` alone: `onAddRow` is typically a fresh inline callback
    // on every parent render (e.g. `onAddRow={(row) => addItem(row)}`), and adding it here
    // would reset this timer on every unrelated parent re-render, not just on real edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft])

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      {/* items-center, not the default stretch: the table selector is a 32px Select
          while every button beside it is 24px, so without it the buttons pin to the
          top of the row instead of sitting on the selector's centre line. */}
      {actions && <div className="flex items-center justify-end gap-1.5">{actions}</div>}
      <div className="flex-1 overflow-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={(row.original as Record<string, unknown>).deleted ? 'opacity-50' : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}

            {/* Always-present entry row, faded until it holds a complete, valid row — then
                it commits (see the effect above) and this same row resets to empty for the next one. */}
            <TableRow className="opacity-60 focus-within:opacity-100">
              {schema.map((col) => (
                <TableCell key={String(col.key)} className="p-1">
                  <DraftCell
                    col={col}
                    value={draft[String(col.key)] ?? ''}
                    invalid={draftErrors[String(col.key)] ?? false}
                    label={t(col.labelKey as never)}
                    suggestions={suggestionsByColumn[String(col.key)] ?? []}
                    onChange={(value) => updateDraftField(String(col.key), value)}
                  />
                </TableCell>
              ))}
              <TableCell />
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function DraftCell<T>({
  col,
  value,
  invalid,
  label,
  suggestions,
  onChange,
}: {
  col: ColumnDef<T>
  value: string
  invalid: boolean
  label: string
  suggestions: readonly string[]
  onChange: (value: string) => void
}) {
  const className = cn(
    'h-7 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-xs outline-none',
    'hover:border-input focus:border-ring focus:ring-1 focus:ring-ring/50',
    invalid && 'border-destructive/60 text-destructive',
  )

  if (col.type === 'combobox') {
    return <ComboboxInput value={value} onChange={onChange} suggestions={suggestions} label={label} className={className} />
  }

  if (col.type === 'select') {
    // The app's own (Radix-based) Select, not a native <select>: a native dropdown's popup
    // is rendered by the OS toolkit on at least Linux, which ignores the page's theme
    // entirely — this one renders in the DOM like everything else, so it's always readable.
    // Always pass a defined string, never undefined — switching value between a real
    // string and undefined flips Select between controlled/uncontrolled, which makes
    // Radix's internal state stick to its last real value instead of clearing on reset.
    return (
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-label={label} className={cn(className, 'justify-between')}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {col.options?.map((option) => (
            <SelectItem key={option} value={option} className="text-xs">
              {col.format ? col.format(option as T[keyof T]) : option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <input
      aria-label={label}
      type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
      className={className}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** A real row cell uses the same input types and validation as the creation row. */
function ExistingRowCell<T>({
  col,
  value,
  label,
  suggestions,
  onCommit,
}: {
  col: ColumnDef<T>
  value: unknown
  label: string
  suggestions: readonly string[]
  onCommit: (value: T[keyof T]) => void
}) {
  const sourceValue = cellInputValue(col, value)
  const [draft, setDraft] = useState(sourceValue)
  const [committed, setCommitted] = useState(sourceValue)

  // Store refreshes after an edit (or an import) replace the row object. Do not clobber
  // text the user is still typing, but otherwise keep the editor in sync with its row.
  useEffect(() => {
    if (draft === committed) setDraft(sourceValue)
    setCommitted(sourceValue)
    // `draft`/`committed` deliberately describe the current local edit, not a reason to
    // re-run this synchronization on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceValue])

  const parsed = parseCellValue(col, draft)
  const invalid = !parsed.ok

  // Existing rows save after the same short pause as the always-present creation row.
  // This prevents a number such as "100" from being saved as "1" and then "10" while
  // still making every cell directly editable without a separate save button.
  useEffect(() => {
    if (draft === committed || !parsed.ok) return
    const timer = setTimeout(() => {
      onCommit(parsed.value as T[keyof T])
      setCommitted(draft)
    }, COMMIT_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [draft, committed, parsed, onCommit])

  return (
    <DraftCell
      col={col}
      value={draft}
      invalid={invalid}
      label={label}
      suggestions={suggestions}
      onChange={setDraft}
    />
  )
}

function cellInputValue<T>(col: ColumnDef<T>, value: unknown): string {
  if (value === undefined || value === null) return ''
  if (col.type === 'date' && typeof value === 'number') return new Date(value).toISOString().slice(0, 10)
  return String(value)
}

/** Empty optional text is valid; every other column must retain a valid value. */
function parseCellValue<T>(col: ColumnDef<T>, raw: string): { ok: true; value: unknown } | { ok: false } {
  if (!raw.trim() && col.type === 'text' && !col.required) return { ok: true, value: '' }
  const result = coerceValue(col, raw)
  return result.ok ? result : { ok: false }
}
