import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react'
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
import { saveTextFile } from '@/lib/file-io'
import {
  VAULT_FILE_NAME,
  exportVaultData,
  getAnyRowFromExport,
  getAnyRowFromTables,
  hasAnyData,
  importVaultData,
  parseVaultExportFile,
  verifyPassphraseAgainstRow,
  wipeVaultData,
} from '@/lib/vault-file'
import { useVaultStore } from '@/store/vault-store'

const MIN_PASSPHRASE_LENGTH = 8
const MAX_PASSPHRASE_LENGTH = 16

function isValidLength(passphrase: string) {
  return passphrase.length >= MIN_PASSPHRASE_LENGTH && passphrase.length <= MAX_PASSPHRASE_LENGTH
}

type DialogState =
  | { kind: 'none' }
  | { kind: 'confirm-wipe'; onConfirm: () => void }
  | { kind: 'error'; title: string; message: string }

export function GetStartedPanel() {
  const { t } = useTranslation('vault')
  const passphraseInVault = useVaultStore((s) => s.passphrase)
  const unlock = useVaultStore((s) => s.unlock)
  const isUnlocked = passphraseInVault !== null

  const [passphrase, setPassphrase] = useState('')
  const [vaultHasData, setVaultHasData] = useState<boolean | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [confirmPassphrase, setConfirmPassphrase] = useState('')
  const importInputRef = useRef<HTMLInputElement>(null)

  const refreshHasData = useCallback(async () => {
    setVaultHasData(await hasAnyData())
  }, [])

  useEffect(() => {
    void refreshHasData()
  }, [refreshHasData])

  function showError(message: string) {
    setDialog({ kind: 'error', title: t('errors.title'), message })
  }

  async function exportCurrentVault() {
    const data = await exportVaultData()
    await saveTextFile({
      filename: VAULT_FILE_NAME,
      contents: JSON.stringify(data, null, 2),
      extension: '.pmvault',
      description: t('getStarted.fileDescription'),
    })
  }

  async function handleContinue() {
    if (!isValidLength(passphrase)) {
      showError(t('errors.passphraseLength'))
      return
    }
    const row = await getAnyRowFromTables()
    if (!row || !(await verifyPassphraseAgainstRow(passphrase, row))) {
      showError(t('errors.wrongPassphrase'))
      return
    }
    unlock(passphrase)
  }

  async function commitNew() {
    await wipeVaultData()
    unlock(passphrase)
    await refreshHasData()
    await exportCurrentVault()
  }

  function handleNewClick() {
    if (!isValidLength(passphrase)) {
      showError(t('errors.passphraseLength'))
      return
    }
    setConfirmPassphrase('')
    setNewDialogOpen(true)
  }

  function handleImportClick() {
    if (!isValidLength(passphrase)) {
      showError(t('errors.passphraseLength'))
      return
    }
    if (vaultHasData) {
      setDialog({ kind: 'confirm-wipe', onConfirm: () => importInputRef.current?.click() })
    } else {
      importInputRef.current?.click()
    }
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const parsed = await (async () => {
      try {
        return parseVaultExportFile(JSON.parse(await file.text()))
      } catch {
        return null
      }
    })()
    if (!parsed) {
      showError(t('errors.malformedFile'))
      return
    }

    const row = getAnyRowFromExport(parsed)
    if (row && !(await verifyPassphraseAgainstRow(passphrase, row))) {
      showError(t('errors.wrongPassphrase'))
      return
    }

    await importVaultData(parsed)
    unlock(passphrase)
    await refreshHasData()
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <h2 className="text-lg font-medium">{t('getStarted.heading')}</h2>

      <Input
        type="password"
        placeholder={t('getStarted.passphrasePlaceholder')}
        value={passphrase}
        onChange={(e) => setPassphrase(e.target.value)}
        className="w-full max-w-sm"
        autoFocus
      />

      <div className="flex flex-wrap justify-center gap-2">
        <Button type="button" variant="outline" onClick={handleNewClick}>
          {t('getStarted.newButton')}
        </Button>
        <Button type="button" variant="outline" onClick={handleImportClick}>
          {t('getStarted.importButton')}
        </Button>
        {isUnlocked ? (
          <Button type="button" onClick={() => void exportCurrentVault()}>
            {t('getStarted.exportButton')}
          </Button>
        ) : (
          <Button type="button" disabled={!vaultHasData} onClick={() => void handleContinue()}>
            {t('getStarted.continueButton')}
          </Button>
        )}
      </div>

      <input
        ref={importInputRef}
        type="file"
        accept=".pmvault,application/json"
        className="hidden"
        onChange={(e) => void handleImportFile(e)}
      />

      {/* Generic confirm/error dialog — covers Import's wipe-confirm gate and every validation/error case. */}
      <AlertDialog open={dialog.kind !== 'none'} onOpenChange={(open) => !open && setDialog({ kind: 'none' })}>
        <AlertDialogContent>
          {dialog.kind === 'confirm-wipe' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('getStarted.importWipeDialog.title')}</AlertDialogTitle>
                <AlertDialogDescription>{t('getStarted.importWipeDialog.description')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('getStarted.importWipeDialog.cancelAction')}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    const onConfirm = dialog.kind === 'confirm-wipe' ? dialog.onConfirm : undefined
                    setDialog({ kind: 'none' })
                    onConfirm?.()
                  }}
                >
                  {t('getStarted.importWipeDialog.confirmAction')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
          {dialog.kind === 'error' && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
                <AlertDialogDescription>{dialog.message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogAction onClick={() => setDialog({ kind: 'none' })}>{t('errors.ok')}</AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      {/* New's own dialog — the one flow needing an embedded form field (confirm-passphrase), not just confirm/cancel. */}
      <AlertDialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('getStarted.newDialog.title')}</AlertDialogTitle>
            {vaultHasData && <AlertDialogDescription>{t('getStarted.newDialog.wipeWarning')}</AlertDialogDescription>}
          </AlertDialogHeader>
          <Input
            type="password"
            placeholder={t('getStarted.newDialog.confirmPassphrasePlaceholder')}
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t('getStarted.newDialog.cancelAction')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                if (confirmPassphrase !== passphrase) {
                  e.preventDefault()
                  showError(t('errors.passphraseMismatch'))
                  return
                }
                setNewDialogOpen(false)
                void commitNew()
              }}
            >
              {t('getStarted.newDialog.confirmAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
