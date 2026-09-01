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
  const { items: notes, isLoading, addItem, deleteItem } = useNotesStore()
  const [draft, setDraft] = useState('')

  return (
    <div className="flex h-full flex-col gap-4 p-4">

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          void addItem({ text: draft.trim() })
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
              <Button variant="ghost" size="icon" onClick={() => void deleteItem(note.id)}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
