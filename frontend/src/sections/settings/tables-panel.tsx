import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAccountsStore, useCardsStore, useEntriesStore, useTableDefsStore, entriesForTable } from '@/lib/model/model-stores'
import type { TableDef } from '@/lib/model/types'
import type { StoredRow } from '@/lib/local-store/create-local-table'

/**
 * Every table in one place, across every section — the workspace-local menu
 * (TableMenu, next to each panel's own selector) covers rename/delete for the table
 * you're already looking at; this is for finding one you're not.
 */
export function TablesPanel() {
  const { t } = useTranslation('settings')
  const tableDefs = useTableDefsStore((s) => s.items)
  const updateTable = useTableDefsStore((s) => s.updateItem)
  const deleteTable = useTableDefsStore((s) => s.deleteItem)
  const entries = useEntriesStore((s) => s.items)
  const deleteEntries = useEntriesStore((s) => s.deleteItems)
  const accounts = useAccountsStore((s) => s.items)
  const cards = useCardsStore((s) => s.items)

  const [renaming, setRenaming] = useState<StoredRow<TableDef> | null>(null)
  const [draftName, setDraftName] = useState('')
  const [deleting, setDeleting] = useState<StoredRow<TableDef> | null>(null)

  function accountName(id?: number) {
    return id ? (accounts.find((a) => a.id === id)?.name ?? '—') : undefined
  }
  function cardName(id?: number) {
    return id ? (cards.find((c) => c.id === id)?.name ?? '—') : undefined
  }

  async function confirmRename() {
    if (!renaming || !draftName.trim()) return
    const { id, createdAt: _createdAt, ...rest } = renaming
    await updateTable(id, { ...rest, name: draftName.trim() })
    setRenaming(null)
  }

  async function confirmDelete() {
    if (!deleting) return
    const ids = entriesForTable(entries, deleting.id).map((row) => row.id)
    if (ids.length > 0) await deleteEntries(ids)
    await deleteTable(deleting.id)
    setDeleting(null)
  }

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-medium">{t('tables.heading')}</h2>
        <p className="text-muted-foreground text-xs">{t('tables.description')}</p>
      </div>

      {tableDefs.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('tables.noTables')}</p>
      ) : (
        <div className="flex flex-col divide-y overflow-auto rounded-md border">
          {tableDefs.map((table) => {
            const binding = accountName(table.accountId) ?? cardName(table.cardId)
            const rowCount = entriesForTable(entries, table.id).length
            return (
              <div key={table.id} className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0">
                  <p className="truncate text-sm">{table.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(`common:tableKinds.${table.kind}` as never)}
                    {binding && ` · ${binding}`} · {t('tables.rowCount', { count: rowCount })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => {
                      setRenaming(table)
                      setDraftName(table.name)
                    }}
                  >
                    {t('tables.rename')}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('tables.delete')}
                    onClick={() => setDeleting(table)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <AlertDialog open={!!renaming} onOpenChange={(open) => !open && setRenaming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tables.renameTitle')}</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            autoFocus
            onKeyDown={(e) => e.key === 'Enter' && draftName.trim() && confirmRename()}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('tables.cancel')}</AlertDialogCancel>
            <AlertDialogAction disabled={!draftName.trim()} onClick={() => void confirmRename()}>
              {t('tables.renameConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tables.deleteTitle', { name: deleting?.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('tables.deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('tables.cancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void confirmDelete()}>
              {t('tables.deleteConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
