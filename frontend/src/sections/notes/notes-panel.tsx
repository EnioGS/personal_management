import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { INTL_LOCALE_TAG } from '@/lib/locale'
import { useLocaleStore } from '@/store/locale-store'
import { useNotesStore } from './notes-store'

export function NotesPanel() {
  const { t } = useTranslation(['notes', 'common'])
  const locale = useLocaleStore((s) => s.locale)
  const { passphrase, notes, isLoading, unlock, lock, addNote, deleteNote } = useNotesStore()
  const [passphraseInput, setPassphraseInput] = useState('')
  const [draft, setDraft] = useState('')

  if (!passphrase) {
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
            if (passphraseInput) void unlock(passphraseInput)
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

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('heading')}</h2>
        <Button variant="ghost" size="sm" onClick={lock}>
          {t('lockButton')}
        </Button>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          void addNote(draft.trim())
          setDraft('')
        }}
      >
        <Input
          placeholder={t('notePlaceholder')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button type="submit" disabled={!draft.trim()}>
          {t('addButton')}
        </Button>
      </form>

      <ScrollArea className="flex-1 rounded-md border">
        <div className="flex flex-col divide-y">
          {isLoading && <p className="text-muted-foreground p-4 text-sm">{t('common:loading')}</p>}
          {!isLoading && notes.length === 0 && (
            <p className="text-muted-foreground p-4 text-sm">{t('emptyState')}</p>
          )}
          {notes.map((note) => (
            <div key={note.id} className="flex items-start justify-between gap-2 p-3">
              <div>
                <p className="text-sm">{note.text}</p>
                <p className="text-muted-foreground text-xs">
                  {new Date(note.createdAt).toLocaleString(INTL_LOCALE_TAG[locale])}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void deleteNote(note.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
