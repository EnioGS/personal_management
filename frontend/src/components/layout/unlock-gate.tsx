import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useVaultStore } from '@/store/vault-store'

interface UnlockGateProps {
  children: ReactNode
}

/**
 * Gates its children behind the shared vault passphrase. Unlocking itself only happens
 * via Vault → Get Started (New/Import/Continue) — this just points there when locked,
 * rather than duplicating that form in every section.
 */
export function UnlockGate({ children }: UnlockGateProps) {
  const { t } = useTranslation('common')
  const passphrase = useVaultStore((s) => s.passphrase)

  if (passphrase) return children

  return (
    <div className="flex h-full items-center justify-center p-8 text-center">
      <p className="text-muted-foreground text-sm">{t('unlock.lockedMessage')}</p>
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
