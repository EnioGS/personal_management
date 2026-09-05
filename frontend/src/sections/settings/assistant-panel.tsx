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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { assistantModelsForProvider, defaultModelForProvider, groupAssistantModelsByProvider } from '@/lib/assistant-models'
import { DEV_API_KEY, useAssistantConfigStore, type AssistantConfig } from '@/lib/assistant-config'
import { detectApiProvider, providerLabel, type ApiProvider } from '@/lib/ai-providers'
import type { StoredRow } from '@/lib/local-store/create-local-table'
import { AssistantProfiles } from './assistant-profiles'

export function AssistantPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <AssistantProfiles />
    </div>
  )
}

function maskApiKey(key: string): string {
  return key.length <= 4 ? '••••' : `••••${key.slice(-4)}`
}

/** Where a list of connections lives: the app's own, or the one a profile cloned. */
export interface ConnectionsBacking {
  items: StoredRow<AssistantConfig>[]
  isLoading: boolean
  addItem: (value: AssistantConfig) => Promise<unknown>
  updateItem: (id: number, value: AssistantConfig) => Promise<unknown>
  deleteItem: (id: number) => Promise<unknown>
}

export function ConnectionsSection({ backing }: { backing?: ConnectionsBacking }) {
  const { t } = useTranslation('settings')
  const store = useAssistantConfigStore()
  const { items, isLoading, addItem, updateItem, deleteItem } = backing ?? store
  const [adding, setAdding] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [replacing, setReplacing] = useState<{ provider: ApiProvider; existing: StoredRow<AssistantConfig> } | null>(null)

  const usingDevFallback = items.length === 0 && !isLoading && !!DEV_API_KEY
  const detected = newKey.trim() ? detectApiProvider(newKey) : null
  const showUnsupported = newKey.trim().length > 0 && detected === null

  function stripRow(row: StoredRow<AssistantConfig>): AssistantConfig {
    const { id: _id, createdAt: _createdAt, ...rest } = row
    return rest
  }

  /** Exactly one connection is active at a time — deactivates every other row first. */
  async function deactivateAllExcept(exceptId?: number) {
    const others = items.filter((item) => item.isActive && item.id !== exceptId)
    await Promise.all(others.map((item) => updateItem(item.id, { ...stripRow(item), isActive: false })))
  }

  async function activateOnly(id: number) {
    await deactivateAllExcept(id)
    const row = items.find((item) => item.id === id)
    if (row) await updateItem(id, { ...stripRow(row), isActive: true })
  }

  async function commitNewConnection(provider: ApiProvider) {
    const value: AssistantConfig = { provider, apiKey: newKey.trim(), model: defaultModelForProvider(provider), isActive: true }
    const existing = items.find((item) => item.provider === provider)
    await deactivateAllExcept(existing?.id)
    if (existing) await updateItem(existing.id, value)
    else await addItem(value)
    setNewKey('')
    setAdding(false)
  }

  function handleConnectClick() {
    const provider = detectApiProvider(newKey)
    if (!provider) return
    const existing = items.find((item) => item.provider === provider)
    if (existing) setReplacing({ provider, existing })
    else void commitNewConnection(provider)
  }

  async function handleModelChange(row: StoredRow<AssistantConfig>, model: string) {
    await updateItem(row.id, { ...stripRow(row), model })
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{t('assistant.connectionLabel')}</p>
        <p className="text-muted-foreground text-xs">{t('assistant.connectionDescription')}</p>
      </div>

      {usingDevFallback && <p className="text-muted-foreground text-xs">{t('assistant.apiKeyFromEnv')}</p>}

      {items.length > 0 && (
        <div className="flex flex-col divide-y overflow-auto rounded-md border">
          {items.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{providerLabel(row.provider)}</p>
                  <p className="text-muted-foreground font-mono text-xs">{maskApiKey(row.apiKey)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {row.isActive ? (
                    <span className="text-primary text-xs font-medium">{t('assistant.active')}</span>
                  ) : (
                    <Button type="button" variant="outline" size="xs" onClick={() => void activateOnly(row.id)}>
                      {t('assistant.use')}
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="icon-xs" aria-label={t('assistant.disconnect')} onClick={() => void deleteItem(row.id)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <Select value={row.model} onValueChange={(model) => void handleModelChange(row, model)}>
                <SelectTrigger className="h-8 w-full max-w-xs text-xs">
                  <SelectValue placeholder={t('assistant.modelPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {groupAssistantModelsByProvider(assistantModelsForProvider(row.provider)).map((group) => (
                    <SelectGroup key={group.provider}>
                      <SelectLabel>{group.provider}</SelectLabel>
                      {group.models.map((model) => (
                        <SelectItem key={model.id} value={model.id}>
                          {model.id}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {adding ? (
        <div className="flex max-w-sm flex-col gap-1.5 rounded-md border p-2.5">
          <Input
            type="password"
            autoFocus
            placeholder={t('assistant.apiKeyPlaceholder')}
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && detected && handleConnectClick()}
          />
          {showUnsupported && <p className="text-destructive text-xs">{t('assistant.unsupportedKey')}</p>}
          {detected && <p className="text-muted-foreground text-xs">{t('assistant.detectedProvider', { provider: providerLabel(detected) })}</p>}
          <div className="flex items-center gap-1.5">
            <Button type="button" size="sm" disabled={!detected} onClick={handleConnectClick}>
              {t('assistant.connect')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setAdding(false)
                setNewKey('')
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            {t('assistant.connect')}
          </Button>
        </div>
      )}

      <AlertDialog open={!!replacing} onOpenChange={(open) => !open && setReplacing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('assistant.replaceTitle', { provider: replacing ? providerLabel(replacing.provider) : '' })}</AlertDialogTitle>
            <AlertDialogDescription>{t('assistant.replaceDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (replacing) void commitNewConnection(replacing.provider)
                setReplacing(null)
              }}
            >
              {t('assistant.replaceConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * One editable prompt stored in the vault. Used for the system prompt and for the
 * ingestion guide the assistant fetches with read_ingestion_guide — both are text
 * sent to the model, so both are the user's to rewrite and to reset.
 */
