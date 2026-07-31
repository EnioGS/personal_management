import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LockButton, UnlockGate } from '@/components/layout/unlock-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { CONFIG_KEY, DEFAULT_MODEL, useAssistantConfigStore } from '@/lib/assistant-config'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY, useAssistantPromptsStore } from '@/lib/assistant-prompts'
import { cn } from '@/lib/utils'

export function AssistantPanel() {
  return (
    <UnlockGate>
      <AssistantContent />
    </UnlockGate>
  )
}

function AssistantContent() {
  const { t } = useTranslation('settings')

  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('assistant.heading')}</h2>
        <LockButton />
      </div>
      <ConnectionSection />
      <SystemPromptSection />
    </div>
  )
}

function ConnectionSection() {
  const { t } = useTranslation('settings')
  const { items, isLoading, addItem, updateItem } = useAssistantConfigStore()
  const [apiKeyDraft, setApiKeyDraft] = useState<string | null>(null)
  const [modelDraft, setModelDraft] = useState<string | null>(null)

  const configRow = items.find((item) => item.key === CONFIG_KEY)

  useEffect(() => {
    if (apiKeyDraft === null && modelDraft === null && !isLoading) {
      setApiKeyDraft(configRow?.apiKey ?? '')
      setModelDraft(configRow?.model ?? DEFAULT_MODEL)
    }
  }, [isLoading, apiKeyDraft, modelDraft, configRow])

  async function handleSave() {
    if (apiKeyDraft === null || modelDraft === null) return
    const value = { key: CONFIG_KEY, apiKey: apiKeyDraft, model: modelDraft }
    if (configRow) await updateItem(configRow.id, value)
    else await addItem(value)
  }

  const ready = apiKeyDraft !== null && modelDraft !== null

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{t('assistant.connectionLabel')}</p>
        <p className="text-muted-foreground text-xs">{t('assistant.connectionDescription')}</p>
      </div>
      <div className="flex max-w-sm flex-col gap-2">
        <Input
          type="password"
          placeholder={t('assistant.apiKeyPlaceholder')}
          value={apiKeyDraft ?? ''}
          onChange={(e) => setApiKeyDraft(e.target.value)}
          disabled={!ready}
        />
        <Input
          placeholder={t('assistant.modelPlaceholder')}
          value={modelDraft ?? ''}
          onChange={(e) => setModelDraft(e.target.value)}
          disabled={!ready}
        />
      </div>
      <div>
        <Button type="button" onClick={() => void handleSave()} disabled={!ready}>
          {t('assistant.save')}
        </Button>
      </div>
    </div>
  )
}

function SystemPromptSection() {
  const { t } = useTranslation('settings')
  const { items, isLoading, addItem, updateItem } = useAssistantPromptsStore()
  const [draft, setDraft] = useState<string | null>(null)
  const [isFocused, setIsFocused] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const systemPromptRow = items.find((item) => item.key === SYSTEM_PROMPT_KEY)

  // Only seeds the draft once, the first time data is available — deliberately
  // not depending on systemPromptRow, so a later refresh (e.g. after Save)
  // doesn't clobber whatever the user is currently typing.
  useEffect(() => {
    if (draft === null && !isLoading) {
      setDraft(systemPromptRow?.content ?? DEFAULT_SYSTEM_PROMPT)
    }
  }, [isLoading, draft, systemPromptRow])

  // Collapsed to one line unless focused, then grows to fit the full text —
  // measured via scrollHeight rather than relying solely on field-sizing:
  // content (already on the base Textarea), since that alone always shows
  // full content rather than collapsing again once focus is lost.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    if (isFocused) {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight}px`
    } else {
      el.style.height = ''
    }
  }, [isFocused, draft])

  async function handleSave() {
    if (draft === null) return
    if (systemPromptRow) {
      await updateItem(systemPromptRow.id, { key: SYSTEM_PROMPT_KEY, content: draft })
    } else {
      await addItem({ key: SYSTEM_PROMPT_KEY, content: draft })
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-sm font-medium">{t('assistant.systemPromptLabel')}</p>
        <p className="text-muted-foreground text-xs">{t('assistant.systemPromptDescription')}</p>
      </div>
      <Textarea
        ref={textareaRef}
        value={draft ?? ''}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        className={cn('resize-none font-mono text-sm', !isFocused && 'h-9 min-h-0 overflow-hidden')}
        disabled={draft === null}
      />
      <div>
        <Button type="button" onClick={() => void handleSave()} disabled={draft === null}>
          {t('assistant.save')}
        </Button>
      </div>
    </div>
  )
}
