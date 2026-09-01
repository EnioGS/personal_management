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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

interface DeleteFlaggedRowsButtonProps {
  flaggedCount: number
  onConfirm: () => void
}

/** Permanently removes rows the assistant (or the user) has flagged deleted — the only way that actually happens. */
export function DeleteFlaggedRowsButton({ flaggedCount, onConfirm }: DeleteFlaggedRowsButtonProps) {
  const { t } = useTranslation()

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="xs" disabled={flaggedCount === 0}>
          <Trash2 className="size-3.5" />
          {t('table.deleteFlagged', { count: flaggedCount })}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('table.deleteFlaggedDialogTitle', { count: flaggedCount })}</AlertDialogTitle>
          <AlertDialogDescription>{t('table.deleteFlaggedDialogDescription')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('table.deleteFlaggedDialogCancel')}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {t('table.deleteFlaggedDialogConfirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
