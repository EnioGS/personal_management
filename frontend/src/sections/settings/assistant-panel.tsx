import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LockButton, UnlockGate } from '@/components/layout/unlock-gate'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY, useAssistantPromptsStore } from '@/lib/assistant-prompts'

export function AssistantPanel() {
  return (
    <UnlockGate>
      <AssistantContent />
    </UnlockGate>
  )
}

function AssistantContent() {
  const { t } = useTranslation('settings')
  const { items, isLoading, addItem, updateItem } = useAssistantPromptsStore()
  const [draft, setDraft] = useState<string | null>(null)

  const systemPromptRow = items.find((item) => item.key === SYSTEM_PROMPT_KEY)

  // Only seeds the draft once, the first time data is available — deliberately
  // not depending on systemPromptRow, so a later refresh (e.g. after Save)
  // doesn't clobber whatever the user is currently typing.
  useEffect(() => {
    if (draft === null && !isLoading) {
      setDraft(systemPromptRow?.content ?? DEFAULT_SYSTEM_PROMPT)
    }
  }, [isLoading, draft, systemPromptRow])

  async function handleSave() {
    if (draft === null) return
    if (systemPromptRow) {
      await updateItem(systemPromptRow.id, { key: SYSTEM_PROMPT_KEY, content: draft })
    } else {
      await addItem({ key: SYSTEM_PROMPT_KEY, content: draft })
    }
  }

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('assistant.heading')}</h2>
        <LockButton />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div>
          <p className="text-sm font-medium">{t('assistant.systemPromptLabel')}</p>
          <p className="text-muted-foreground text-xs">{t('assistant.systemPromptDescription')}</p>
        </div>
        <Textarea
          value={draft ?? ''}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-0 flex-1 resize-none font-mono text-sm"
          disabled={draft === null}
        />
        <div>
          <Button type="button" onClick={() => void handleSave()} disabled={draft === null}>
            {t('assistant.save')}
          </Button>
        </div>
      </div>
    </div>
  )
}
