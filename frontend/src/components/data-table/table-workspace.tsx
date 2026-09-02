import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { CsvExportButton } from '@/components/data-table/csv-export-button'
import { CsvImportDialog } from '@/components/data-table/csv-import-dialog'
import { DeleteFlaggedRowsButton } from '@/components/data-table/delete-flagged-rows-button'
import { EditableDataTable } from '@/components/data-table/editable-data-table'
import { AddTableDialog } from '@/components/data-table/add-table-dialog'
import { TableMenu } from '@/components/data-table/table-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { entriesForTable, useCategoriesStore, useEntriesStore, useTableDefsStore } from '@/lib/model/model-stores'
import { categoryColumnFor, TABLE_KIND_SCHEMAS } from '@/lib/model/table-kinds'
import type { Entry, TableKind } from '@/lib/model/types'
import { useUiStore } from '@/store/ui-store'

interface TableWorkspaceProps {
  /** Namespaces the remembered table selection — usually the section item's id. */
  workspaceId: string
  /** Which kinds of table belong in this panel. */
  kinds: TableKind[]
}

/**
 * A panel's table half: pick one of the user's tables of the given kinds, or add
 * another. Everything here is driven by tableDefs/entries rather than a hardcoded
 * store, so a new table needs no code (see lib/model/).
 */
export function TableWorkspace({ workspaceId, kinds }: TableWorkspaceProps) {
  const { t } = useTranslation()
  const tableDefs = useTableDefsStore((s) => s.items)
  const addTable = useTableDefsStore((s) => s.addItem)
  const updateTable = useTableDefsStore((s) => s.updateItem)
  const deleteTable = useTableDefsStore((s) => s.deleteItem)
  const entries = useEntriesStore((s) => s.items)
  const addEntry = useEntriesStore((s) => s.addItem)
  const addEntries = useEntriesStore((s) => s.addItems)
  const deleteEntry = useEntriesStore((s) => s.deleteItem)
  const deleteEntries = useEntriesStore((s) => s.deleteItems)
  const activeTableByWorkspace = useUiStore((s) => s.activeTableByWorkspace)
  const selectTable = useUiStore((s) => s.selectTable)
  const categories = useCategoriesStore((s) => s.items)

  const available = useMemo(() => tableDefs.filter((def) => kinds.includes(def.kind)), [tableDefs, kinds])

  // Falls back to the first available table so the panel is never blank just because
  // nothing has been picked yet, or because the remembered table was deleted.
  const remembered = activeTableByWorkspace[workspaceId]
  const active = available.find((def) => def.id === remembered) ?? available[0]

  const rows = useMemo(() => (active ? entriesForTable(entries, active.id) : []), [entries, active])
  const flagged = rows.filter((row) => row.deleted)

  // The category vocabulary is shared across every table. Raw values stay raw until
  // the user explicitly adds a category and a match string in Settings.
  const categoryColumn = active ? categoryColumnFor(active.kind) : null
  const schema = useMemo(() => {
    if (!active) return []
    if (!categoryColumn) return TABLE_KIND_SCHEMAS[active.kind]
    const categoryNames = categories.map((c) => c.name)
    return TABLE_KIND_SCHEMAS[active.kind].map((col) =>
      col.key === categoryColumn ? { ...col, options: [...new Set([...(col.options ?? []), ...categoryNames])] } : col,
    )
  }, [active, categoryColumn, categories])

  // Deleting a table takes its rows with it — nothing else can reach an entry once its
  // tableId no longer resolves to a definition, so leaving them behind would only be
  // silent, unreachable storage rather than a real safety net.
  async function handleDeleteTable() {
    if (!active) return
    const ids = entriesForTable(entries, active.id).map((row) => row.id)
    if (ids.length > 0) await deleteEntries(ids)
    await deleteTable(active.id)
  }

  const selector = (
    <div className="flex items-center gap-1.5">
      {available.length > 0 && (
        <Select
          value={active ? String(active.id) : ''}
          onValueChange={(value) => selectTable(workspaceId, Number(value))}
        >
          <SelectTrigger size="sm" className="h-6 min-w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {available.map((def) => (
              <SelectItem key={def.id} value={String(def.id)} className="text-xs">
                {def.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {active && (
        <TableMenu
          tableName={active.name}
          onRename={(name) => {
            const { id, createdAt: _createdAt, ...def } = active
            void updateTable(id, { ...def, name })
          }}
          onDelete={() => void handleDeleteTable()}
        />
      )}
      <AddTableDialog kinds={kinds} onCreate={(table) => void addTable(table)} />
    </div>
  )

  if (!active) {
    return (
      <div className="flex h-full flex-col gap-3 p-2">
        <div className="flex justify-end">{selector}</div>
        <div className="text-muted-foreground flex flex-1 items-center justify-center rounded-md border border-dashed text-xs">
          {t('table.noTablesYet')}
        </div>
      </div>
    )
  }

  return (
    <EditableDataTable
      key={active.id}
      schema={schema}
      rows={rows}
      onAddRow={(row) => {
        void addEntry({ ...(row as Entry), tableId: active.id })
      }}
      onDeleteRow={(id) => void deleteEntry(id)}
      actions={
        <>
          {selector}
          <CsvExportButton rows={rows} schema={schema} filename={`${active.name}.csv`} />
          <CsvImportDialog
            schema={schema}
            onImport={(imported) => {
              void addEntries(imported.map((row) => ({ ...(row as Entry), tableId: active.id })))
            }}
          />
          <DeleteFlaggedRowsButton
            flaggedCount={flagged.length}
            onConfirm={() => void deleteEntries(flagged.map((row) => row.id))}
          />
        </>
      }
    />
  )
}
