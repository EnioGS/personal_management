import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { addClassificationNote, deleteClassificationNote, editClassificationNote, listClassificationNotes, type StoredNote } from '@/lib/model/classification-notes'
import { useClassificationNotesStore } from '@/lib/model/model-stores'
import { MarkdownText } from '@/components/markdown/markdown-text'
import { cn } from '@/lib/utils'
import type { RuleContext } from '@/lib/model/types'

/** What a note is called in a list: its title, or the first thing it says. */
function headline(note: { title?: string; text: string }): string {
  return note.title?.trim() || note.text.split('\n')[0]
}

/**
 * What is true of this data, in words.
 *
 * A rule matches text and fills labels; everything a rule cannot express — that a shop
 * nobody would recognise sells food, that one file's rows for a month were a rebalance,
 * that transfers to a particular name are rent — has nowhere else to go. Notes are that
 * place. They label nothing by themselves: the assistant is handed them with the guide
 * before it labels anything, so what the user explained once does not have to be
 * explained again next month.
 *
 * Shown one line each and opened one at a time. A dozen notes laid out in full is a page
 * nobody reads to the end of, and the thing a person comes here to do is find the one
 * note they half remember — which is a list of names, not a wall of prose.
 */
export function ClassificationNotes({ context }: { context: RuleContext }) {
  const stored = useClassificationNotesStore((store) => store.items)
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [draft, setDraft] = useState<{ title: string; text: string } | null>(null)
  /** The note being redrafted. Null while nothing is being edited. */
  const [editing, setEditing] = useState<{ id: number; title: string; text: string } | null>(null)
  /** The one note showing its whole self. Opening another closes this. */
  const [open, setOpen] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setNotes(await listClassificationNotes(context))
  }, [context])

  useEffect(() => { void refresh() }, [refresh, stored])

  async function save() {
    if (!draft?.text.trim()) { setDraft(null); return }
    await addClassificationNote({ context, title: draft.title, text: draft.text, createdBy: 'user' })
    setDraft(null)
    await refresh()
  }

  async function remove(id: number) {
    await deleteClassificationNote(id)
    await refresh()
  }

  async function saveEdit() {
    if (!editing) return
    if (editing.text.trim()) await editClassificationNote(editing.id, editing.text, 'user', editing.title)
    setEditing(null)
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
          <Input
            autoFocus
            value={draft.title}
            placeholder="Title — a few words. Left empty, the first line stands in."
            className="h-8 text-xs"
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <Textarea
            value={draft.text}
            rows={3}
            placeholder="e.g. Charme is a market near home — its rows are groceries, not leisure. Markdown works."
            className="text-xs"
            onChange={(event) => setDraft({ ...draft, text: event.target.value })}
          />
          <div className="flex gap-2">
            <Button type="button" size="xs" onClick={() => void save()}>Save note</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="xs" variant="outline" className="self-start" onClick={() => setDraft({ title: '', text: '' })}>
          <Plus className="mr-1 size-3.5" /> New note
        </Button>
      )}

      {notes.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">Nothing written down yet.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {notes.map((note) => (
            <div key={note.id} className="text-xs">
              {editing?.id === note.id ? (
                <div className="flex flex-col gap-2 p-3">
                  <Input
                    autoFocus
                    value={editing.title}
                    placeholder="Title — a few words. Left empty, the first line stands in."
                    className="h-8 text-xs"
                    onChange={(event) => setEditing({ ...editing, title: event.target.value })}
                  />
                  <Textarea
                    rows={4}
                    value={editing.text}
                    className="text-xs"
                    onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="xs" onClick={() => void saveEdit()}>Save</Button>
                    <Button type="button" size="xs" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                      aria-expanded={open === note.id}
                      onClick={() => setOpen(open === note.id ? null : note.id)}
                    >
                      <ChevronRight className={cn('size-3 shrink-0 transition-transform', open === note.id && 'rotate-90')} aria-hidden />
                      <span className={cn('truncate', !note.title && 'text-muted-foreground')}>{headline(note)}</span>
                    </button>
                    <div className="flex shrink-0 gap-1">
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        onClick={() => setEditing({ id: note.id, title: note.title ?? '', text: note.text })}
                        aria-label="Edit note"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button type="button" size="xs" variant="ghost" className="text-destructive" onClick={() => void remove(note.id)} aria-label="Delete note">
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>

                  {open === note.id && (
                    <div className="px-3 pb-3 pl-[26px]">
                      {/* A note is prose, and prose is got right by redrafting: double-click
                          it, the way a cell in a table is edited. Written in Markdown and
                          shown as it was meant to read — a note explaining three cases wants
                          three bullets, not three lines of asterisks. */}
                      <div
                        className="flex flex-col gap-1"
                        onDoubleClick={() => setEditing({ id: note.id, title: note.title ?? '', text: note.text })}
                      >
                        <MarkdownText content={note.text} />
                      </div>
                      <p className="text-muted-foreground mt-1">
                        {`${note.createdBy} · ${new Date(note.createdAt).toISOString().slice(0, 10)}`}
                        {note.editedBy && ` · edited by ${note.editedBy}`}
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
