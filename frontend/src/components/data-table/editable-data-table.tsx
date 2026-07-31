import { useMemo, useState, type ReactNode } from 'react'
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef as TanstackColumnDef } from '@tanstack/react-table'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { coerceValue } from '@/lib/csv'
import type { DecryptedRow } from '@/lib/secure-store/create-encrypted-table'
import type { TableSchema } from '@/lib/table-schema'

interface EditableDataTableProps<T extends Record<string, unknown>> {
  schema: TableSchema<T>
  rows: DecryptedRow<T>[]
  onAddRow: (row: T) => void
  onDeleteRow: (id: number) => void
  /** Rendered in the same root container as the form/table (e.g. CSV export/import buttons). */
  actions?: ReactNode
}

export function EditableDataTable<T extends Record<string, unknown>>({
  schema,
  rows,
  onAddRow,
  onDeleteRow,
  actions,
}: EditableDataTableProps<T>) {
  const { t } = useTranslation()

  const columns = useMemo<TanstackColumnDef<DecryptedRow<T>>[]>(
    () => [
      ...schema.map((col) => ({
        id: String(col.key),
        accessorFn: (row: DecryptedRow<T>) => row[col.key],
        header: () => t(col.labelKey as never),
        cell: ({ getValue }: { getValue: () => unknown }) =>
          col.format ? col.format(getValue() as T[keyof T]) : String(getValue() ?? ''),
      })),
      {
        id: 'actions',
        header: () => null,
        cell: ({ row }: { row: { original: DecryptedRow<T> } }) => (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t('table.delete')}
            onClick={() => onDeleteRow(row.original.id)}
          >
            <Trash2 className="size-4" />
          </Button>
        ),
      },
    ],
    [schema, t, onDeleteRow],
  )

  const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      {actions && <div className="flex justify-end gap-2">{actions}</div>}
      <AddRowForm schema={schema} onAddRow={onAddRow} />
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
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={schema.length + 1} className="text-muted-foreground text-center">
                  {t('table.noRows')}
                </TableCell>
              </TableRow>
            )}
            {table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function AddRowForm<T extends Record<string, unknown>>({
  schema,
  onAddRow,
}: {
  schema: TableSchema<T>
  onAddRow: (row: T) => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const row: Partial<T> = {}
        for (const col of schema) {
          const result = coerceValue(col, draft[String(col.key)] ?? '')
          if (!result.ok) {
            setError(result.message)
            return
          }
          row[col.key] = result.value as T[keyof T]
        }
        setError(null)
        onAddRow(row as T)
        setDraft({})
      }}
    >
      {schema.map((col) => (
        <div key={String(col.key)} className="flex flex-col gap-1">
          <label className="text-muted-foreground text-xs">{t(col.labelKey as never)}</label>
          {col.type === 'select' ? (
            <Select
              value={draft[String(col.key)] ?? ''}
              onValueChange={(value) => setDraft((d) => ({ ...d, [String(col.key)]: value }))}
            >
              <SelectTrigger size="sm" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {col.options?.map((option) => (
                  <SelectItem key={option} value={option}>
                    {col.format ? col.format(option as T[keyof T]) : option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
              className="h-8 w-36"
              value={draft[String(col.key)] ?? ''}
              onChange={(e) => setDraft((d) => ({ ...d, [String(col.key)]: e.target.value }))}
            />
          )}
        </div>
      ))}
      <Button type="submit" size="sm">
        {t('table.add')}
      </Button>
      {error && <p className="text-destructive w-full text-xs">{error}</p>}
    </form>
  )
}
