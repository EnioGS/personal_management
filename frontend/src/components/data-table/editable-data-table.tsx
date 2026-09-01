import { useMemo, useState, type ReactNode } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef as TanstackColumnDef } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { coerceValue } from '@/lib/csv'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import type { ColumnDef, TableSchema } from '@/lib/table-schema'

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
  // a valid value — there's no separate "confirm" step, matching how the rest of the row
  // is entered directly into the table rather than through a form.
  function tryCommitDraft() {
    const row = buildRowFromDraft()
    if (!row) return
    onAddRow(row)
    setDraft({})
  }

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
                it commits (see tryCommitDraft) and this same row resets to empty for the next one. */}
            <TableRow
              className="opacity-60 focus-within:opacity-100"
              onBlur={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
                tryCommitDraft()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') tryCommitDraft()
              }}
            >
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
    return (
      <select aria-label={label} className={className} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled hidden />
        {col.options?.map((option) => (
          <option key={option} value={option}>
            {col.format ? col.format(option as T[keyof T]) : option}
          </option>
        ))}
      </select>
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
