import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { addClassificationNote, deleteClassificationNote, listClassificationNotes, type StoredNote } from '@/lib/model/classification-notes'
import { useClassificationNotesStore } from '@/lib/model/model-stores'
import type { RuleContext } from '@/lib/model/types'

/**
 * What is true of this data, in words.
 *
 * A rule matches text and fills labels; everything a rule cannot express — that a shop
 * nobody would recognise sells food, that one file's rows for a month were a rebalance,
 * that transfers to a particular name are rent — has nowhere else to go. Notes are that
 * place. They label nothing by themselves: the assistant is handed them with the guide
 * before it labels anything, so what the user explained once does not have to be
 * explained again next month.
 */
export function ClassificationNotes({ context }: { context: RuleContext }) {
  const stored = useClassificationNotesStore((store) => store.items)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [draft, setDraft] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setNotes(await listClassificationNotes(context))
  }, [context])

  useEffect(() => { void refresh() }, [refresh, stored])

  async function save() {
    if (!draft?.trim()) { setDraft(null); return }
    await addClassificationNote({ context, text: draft, createdBy: 'user' })
    setDraft(null)
    await refresh()
  }

  async function remove(id: number) {
    await deleteClassificationNote(id)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">
          {context === 'source' ? 'Notes for files being worked on' : 'Notes on the data already imported'}
        </h3>
        <p className="text-muted-foreground text-xs">
          Not rules — nothing here labels anything by itself. Write what a rule cannot say: what an unrecognisable
          merchant actually is, what a file's own quirks mean, how you want a borderline case treated. The assistant
          is given these before it labels anything, so an explanation lands once and holds.
        </p>
      </div>

      {draft !== null ? (
        <div className="flex flex-col gap-2 rounded-md border p-3">
          <Textarea
            autoFocus
            value={draft}
            rows={3}
            placeholder="e.g. Charme is a market near home — its rows are groceries, not leisure."
            className="text-xs"
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex gap-2">
            <Button type="button" size="xs" onClick={() => void save()}>Save note</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="xs" variant="outline" className="self-start" onClick={() => setDraft('')}>
          <Plus className="mr-1 size-3.5" /> New note
        </Button>
      )}

      {notes.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">Nothing written down yet.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {notes.map((note) => (
            <div key={note.id} className="flex items-start justify-between gap-3 p-3 text-xs">
              <div className="min-w-0">
                <p className="whitespace-pre-wrap">{note.text}</p>
                <p className="text-muted-foreground mt-1">
                  {`${note.createdBy} · ${new Date(note.createdAt).toISOString().slice(0, 10)}`}
                </p>
              </div>
              <Button type="button" size="xs" variant="ghost" onClick={() => void remove(note.id)} aria-label="Delete note">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
