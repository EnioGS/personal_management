import { useState } from 'react'
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

interface TableMenuProps {
  tableName: string
  onRename: (name: string) => void
  onDelete: () => void
}

/** Rename / delete for the table currently selected in a TableWorkspace. */
export function TableMenu({ tableName, onRename, onDelete }: TableMenuProps) {
  const { t } = useTranslation()
  const [renaming, setRenaming] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [draftName, setDraftName] = useState(tableName)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon-xs" aria-label={t('table.tableMenu')}>
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              setDraftName(tableName)
              setRenaming(true)
            }}
          >
            <Pencil className="size-3.5" />
            {t('table.renameTable')}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
            <Trash2 className="size-3.5" />
            {t('table.deleteTable')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={renaming} onOpenChange={setRenaming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('table.renameTable')}</AlertDialogTitle>
          </AlertDialogHeader>
          <Input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !draftName.trim()) return
              onRename(draftName.trim())
              setRenaming(false)
            }}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('table.addTableCancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!draftName.trim()}
              onClick={() => onRename(draftName.trim())}
            >
              {t('table.renameTableConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('table.deleteTableDialogTitle', { name: tableName })}</AlertDialogTitle>
            <AlertDialogDescription>{t('table.deleteTableDialogDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('table.addTableCancel')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              {t('table.deleteTableConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
