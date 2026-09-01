import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef as TanstackColumnDef } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
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
  onDeleteRow: (id: number) => void
  /** Rendered above the table (e.g. CSV export/import buttons). */
  actions?: ReactNode
}

/** date/number/select are always mandatory; 'text' columns are optional unless marked required. */
function isColumnRequired<T>(col: ColumnDef<T>): boolean {
  return col.type !== 'text' || !!col.required
}

export function EditableDataTable<T extends Record<string, unknown>>({
  schema,
  rows,
  onAddRow,
  onDeleteRow,
  actions,
}: EditableDataTableProps<T>) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Record<string, string>>({})

  const columns = useMemo<TanstackColumnDef<StoredRow<T>>[]>(
    () => [
      ...schema.map((col) => ({
        id: String(col.key),
        accessorFn: (row: StoredRow<T>) => row[col.key],
        header: () => t(col.labelKey as never),
        cell: ({ getValue }: { getValue: () => unknown }) =>
          col.format ? col.format(getValue() as T[keyof T]) : String(getValue() ?? ''),
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
    [schema, t, onDeleteRow],
  )

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

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
      {actions && <div className="flex justify-end gap-1.5">{actions}</div>}
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
  onChange,
}: {
  col: ColumnDef<T>
  value: string
  invalid: boolean
  label: string
  onChange: (value: string) => void
}) {
  const className = cn(
    'h-7 w-full min-w-0 rounded-sm border border-transparent bg-transparent px-1.5 text-xs outline-none',
    'hover:border-input focus:border-ring focus:ring-1 focus:ring-ring/50',
    invalid && 'border-destructive/60 text-destructive',
  )

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
