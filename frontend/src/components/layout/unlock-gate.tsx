import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useVaultStore } from '@/store/vault-store'

interface UnlockGateProps {
  children: ReactNode
}

/** Gates its children behind the shared vault passphrase. Unlocking once unlocks every section built on this. */
export function UnlockGate({ children }: UnlockGateProps) {
  const { t } = useTranslation('common')
  const passphrase = useVaultStore((s) => s.passphrase)
  const unlock = useVaultStore((s) => s.unlock)
  const [passphraseInput, setPassphraseInput] = useState('')

  if (passphrase) return children

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <h2 className="text-lg font-medium">{t('unlock.title')}</h2>
        <p className="text-muted-foreground text-sm">{t('unlock.description')}</p>
      </div>
      <form
        className="flex w-full max-w-sm gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (passphraseInput) unlock(passphraseInput)
        }}
      >
        <Input
          type="password"
          placeholder={t('unlock.passphrasePlaceholder')}
          value={passphraseInput}
          onChange={(e) => setPassphraseInput(e.target.value)}
          autoFocus
        />
        <Button type="submit" disabled={!passphraseInput}>
          {t('unlock.button')}
        </Button>
      </form>
    </div>
  )
}

export function LockButton() {
  const { t } = useTranslation('common')
  const lock = useVaultStore((s) => s.lock)
  return (
    <Button type="button" variant="ghost" size="sm" onClick={lock}>
      {t('unlock.lockButton')}
    </Button>
  )
}
