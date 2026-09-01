import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { Download, HardDrive, Trash2, Upload } from 'lucide-react'
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
  DATA_FILE_EXTENSION,
  DATA_FILE_NAME,
  countAllRows,
  exportData,
  importData,
  parseDataExportFile,
  wipeAllData,
} from '@/lib/data-file'
import { saveTextFile } from '@/lib/file-io'

type DialogState =
  | { kind: 'none' }
  | { kind: 'confirm-import' }
  | { kind: 'confirm-wipe' }
  | { kind: 'error'; message: string }

/**
 * The data-management home: everything already in this browser is live the moment
 * the app loads (no passphrase, no "continue" step — see adr/0019), so this panel is
 * only about moving that data between machines — export, import, and starting over.
 */
export function DataPanel() {
  const { t } = useTranslation('vault')
  const [rowCount, setRowCount] = useState<number | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const importInputRef = useRef<HTMLInputElement>(null)

  const refreshCount = useCallback(async () => {
    setRowCount(await countAllRows())
  }, [])

  useEffect(() => {
    void refreshCount()
  }, [refreshCount])

  const hasData = (rowCount ?? 0) > 0

  async function handleExport() {
    const data = await exportData()
    await saveTextFile({
      filename: DATA_FILE_NAME,
      contents: JSON.stringify(data, null, 2),
      extension: DATA_FILE_EXTENSION,
      description: t('data.fileDescription'),
    })
  }

  function handleImportClick() {
    // Import replaces everything, so it only asks first when there is something to lose.
    if (hasData) setDialog({ kind: 'confirm-import' })
    else importInputRef.current?.click()
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const parsed = await (async () => {
      try {
        return parseDataExportFile(JSON.parse(await file.text()))
      } catch {
        return null
      }
    })()
    if (!parsed) {
      setDialog({ kind: 'error', message: t('errors.malformedFile') })
      return
    }

    await importData(parsed)
    await refreshCount()
  }

  async function handleWipe() {
    await wipeAllData()
    await refreshCount()
  }

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
        <p className="text-muted-foreground text-sm">{t('data.description')}</p>

        <div className="bg-muted/40 flex items-center gap-3 rounded-lg border p-4">
          <HardDrive className="text-muted-foreground size-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('data.storage.title')}</p>
            <p className="text-muted-foreground text-xs">
              {rowCount === null
                ? t('data.storage.counting')
                : hasData
                  ? t('data.storage.rowCount', { count: rowCount })
                  : t('data.storage.empty')}
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard
            icon={<Download className="size-4" />}
            title={t('data.export.title')}
            description={t('data.export.description')}
            action={
              <Button type="button" disabled={!hasData} onClick={() => void handleExport()}>
                {t('data.export.action')}
              </Button>
            }
          />
          <ActionCard
            icon={<Upload className="size-4" />}
            title={t('data.import.title')}
            description={t('data.import.description')}
            action={
              <Button type="button" variant="outline" onClick={handleImportClick}>
                {t('data.import.action')}
              </Button>
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t('data.reset.title')}</p>
            <p className="text-muted-foreground text-xs">{t('data.reset.description')}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            disabled={!hasData}
            onClick={() => setDialog({ kind: 'confirm-wipe' })}
          >
            <Trash2 className="size-4" />
            {t('data.reset.action')}
          </Button>
        </div>

        <input
          ref={importInputRef}
          type="file"
          accept={`${DATA_FILE_EXTENSION},application/json`}
          className="hidden"
          onChange={(e) => void handleImportFile(e)}
        />

        {/* One dialog covers both destructive confirmations and the malformed-file error. */}
        <AlertDialog open={dialog.kind !== 'none'} onOpenChange={(open) => !open && setDialog({ kind: 'none' })}>
          <AlertDialogContent>
            {dialog.kind === 'error' ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('errors.title')}</AlertDialogTitle>
                  <AlertDialogDescription>{dialog.message}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogAction onClick={() => setDialog({ kind: 'none' })}>{t('errors.ok')}</AlertDialogAction>
                </AlertDialogFooter>
              </>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {dialog.kind === 'confirm-wipe'
                      ? t('data.resetDialog.title')
                      : t('data.importDialog.title')}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {dialog.kind === 'confirm-wipe'
                      ? t('data.resetDialog.description')
                      : t('data.importDialog.description')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('data.cancelAction')}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      const kind = dialog.kind
                      setDialog({ kind: 'none' })
                      if (kind === 'confirm-wipe') void handleWipe()
                      else importInputRef.current?.click()
                    }}
                  >
                    {dialog.kind === 'confirm-wipe'
                      ? t('data.resetDialog.confirmAction')
                      : t('data.importDialog.confirmAction')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

function ActionCard({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description: string
  action: ReactNode
}) {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="text-muted-foreground flex-1 text-xs leading-relaxed">{description}</p>
      <div>{action}</div>
    </div>
  )
}
