import { useCallback, useEffect, useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { addClassificationNote, deleteClassificationNote, editClassificationNote, listClassificationNotes, scopeRefusal, type NoteKind, type StoredNote } from '@/lib/model/classification-notes'
import { useAgentMemoryStore, useClassificationNotesStore } from '@/lib/model/model-stores'
import { MarkdownText } from '@/components/markdown/markdown-text'
import { cn } from '@/lib/utils'
import { NOTE_SCOPE_FIELDS, type NoteScope, type RuleContext } from '@/lib/model/types'

const EMPTY_SCOPE: NoteScope = { account: '', card: '', section: '', screen: '', class: '', category: '', subcategory: '', lines: '' }

/** The scope, as eight short boxes: what this is about, before what it says. */
function ScopeFields({ scope, onChange }: { scope: NoteScope; onChange: (next: NoteScope) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-muted-foreground text-[11px]">
        What this is about. A blank field means nobody has said yet, which leaves the note incomplete — write
        <span className="font-mono"> global </span>
        where it genuinely is not restricted. They narrow independently: one class, global everywhere else, is a note
        about that class in every table.
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {NOTE_SCOPE_FIELDS.map((field) => (
          <Input
            key={field}
            value={scope[field]}
            placeholder={field}
            className="h-7 text-xs"
            onChange={(event) => onChange({ ...scope, [field]: event.target.value })}
          />
        ))}
      </div>
    </div>
  )
}

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
export function ClassificationNotes({ context, kind = 'note' }: { context: RuleContext; kind?: NoteKind }) {
  const notesStored = useClassificationNotesStore((store) => store.items)
  const memoryStored = useAgentMemoryStore((store) => store.items)
  const stored = kind === 'note' ? notesStored : memoryStored
  const [notes, setNotes] = useState<StoredNote[]>([])
  const [draft, setDraft] = useState<{ title: string; text: string; scope: NoteScope } | null>(null)
  /** The note being redrafted. Null while nothing is being edited. */
  const [editing, setEditing] = useState<{ id: number; title: string; text: string; scope: NoteScope } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  /** The one note showing its whole self. Opening another closes this. */
  const [open, setOpen] = useState<number | null>(null)

  const refresh = useCallback(async () => {
    setNotes(await listClassificationNotes(context, kind))
  }, [context, kind])

  useEffect(() => { void refresh() }, [refresh, stored])

  async function save() {
    if (!draft?.text.trim()) { setDraft(null); return }
    const wrong = scopeRefusal(draft.scope)
    if (wrong) { setRefusal(wrong); return }
    await addClassificationNote({ context, title: draft.title, text: draft.text, scope: draft.scope, createdBy: 'user' }, kind)
    setDraft(null)
    setRefusal(null)
    await refresh()
  }

  async function remove(id: number) {
    await deleteClassificationNote(id, kind)
    await refresh()
  }

  async function saveEdit() {
    if (!editing) return
    const wrong = scopeRefusal(editing.scope)
    if (wrong) { setRefusal(wrong); return }
    if (editing.text.trim()) await editClassificationNote(editing.id, editing.text, 'user', editing.title, editing.scope, kind)
    setEditing(null)
    setRefusal(null)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">
          {kind === 'memory'
            ? 'Agent memory'
            : (context === 'source' ? 'Notes for files being worked on' : 'Notes on the data already imported')}
        </h3>
        <p className="text-muted-foreground text-xs">
          {kind === 'memory'
            ? "The assistant's own working record, kept whole rather than split by stage: what it could not label and why, and what it labelled once somebody explained. It writes here itself and reads it back when it needs to; you can correct or delete anything in it."
            : "Not rules — nothing here labels anything by itself. Write what a rule cannot say: what an unrecognisable merchant actually is, what a file's own quirks mean, how you want a borderline case treated. The assistant is given these before it labels anything, so an explanation lands once and holds."}
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
          <ScopeFields scope={draft.scope} onChange={(scope) => setDraft({ ...draft, scope })} />
          {refusal && <p className="text-destructive text-[11px]">{refusal}</p>}
          <div className="flex gap-2">
            <Button type="button" size="xs" onClick={() => void save()}>Save note</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="xs" variant="outline" className="self-start" onClick={() => { setRefusal(null); setDraft({ title: '', text: '', scope: { ...EMPTY_SCOPE } }) }}>
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
                  <ScopeFields scope={editing.scope} onChange={(scope) => setEditing({ ...editing, scope })} />
                  {refusal && <p className="text-destructive text-[11px]">{refusal}</p>}
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
                        onClick={() => setEditing({ id: note.id, title: note.title ?? '', text: note.text, scope: { ...EMPTY_SCOPE, ...note.scope } })}
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
                        onDoubleClick={() => setEditing({ id: note.id, title: note.title ?? '', text: note.text, scope: { ...EMPTY_SCOPE, ...note.scope } })}
                      >
                        <MarkdownText content={note.text} />
                      </div>
                      {note.scope && (
                        <p className="text-muted-foreground mt-1 font-mono text-[11px]">
                          {NOTE_SCOPE_FIELDS.map((field) => `${field}: ${note.scope?.[field] || '—'}`).join(' · ')}
                        </p>
                      )}
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
