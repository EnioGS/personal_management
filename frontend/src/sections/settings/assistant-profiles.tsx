import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Columns3, Plus, RotateCcw, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { asUsageRecord, derived, resetProfileUsage, sumUsage, useUsageRecordsStore, type UsageRecord } from '@/lib/chat/usage-ledger'
import { readHiddenColumns, writeHiddenColumns } from '@/lib/metric-columns'
import { SYSTEM_PROMPT_KEY } from '@/lib/assistant-prompts'
import { useAssistantConfigStore, type AssistantConfig } from '@/lib/assistant-config'
import { ConnectionsSection, type ConnectionsBacking } from './assistant-panel'
import {
  DEFAULT_PROFILE,
  createProfile,
  deleteProfile,
  selectProfile,
  setOverride,
  setProfileConnections,
  useAssistantProfilesStore,
  type AssistantProfile,
} from '@/lib/prompts/profiles'
import { useAssistantPromptsStore } from '@/lib/assistant-prompts'
import { brokenPlaceholders, promptRegistry, requiredPlaceholders, type PromptEntry } from '@/lib/prompts/registry'
import { cn } from '@/lib/utils'

type Row = UsageRecord & ReturnType<typeof derived>
type SortKey = keyof Row

/**
 * What every profile has spent, and what each of them says.
 *
 * A profile is a whole set of wordings under one name — the system prompt, the guide,
 * every tool's description — so two ways of saying the same thing can be run against the
 * same data and told apart by what they cost and how far they got. The table above is the
 * only reason the editor below is worth having.
 */
export function AssistantProfiles() {
  return (
    <>
      <UsageTable />
      <ProfileEditor />
    </>
  )
}

/** The tool table's own scope: every profile at once, or one of them. */
const ALL_PROFILES = '*'

const CURRENCY = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 })
const COUNT = new Intl.NumberFormat('en-US')
const RATIO = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 })
const DECIMAL = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })

/**
 * Everything a message can be measured by.
 *
 * Deliberately more than anyone reads at once: a metric not collected is a question that
 * cannot be asked later, and the ones that decide whether a wording is better — how many
 * rounds it took, how often a tool refused it, how much of the prompt was cached, how long
 * a person waited — are none of them the obvious one. The table scrolls; the questions do
 * not have to be anticipated.
 */
const COLUMNS: {
  key: SortKey
  label: string
  numeric?: boolean
  read: (row: Row) => string | number
}[] = [
  { key: 'profile', label: 'Profile', read: (row) => row.profile },
  { key: 'provider', label: 'API', read: (row) => row.provider },
  { key: 'model', label: 'Model', read: (row) => row.model },
  { key: 'messages', label: 'Messages', numeric: true, read: (row) => COUNT.format(row.messages) },
  { key: 'requests', label: 'Rounds', numeric: true, read: (row) => COUNT.format(row.requests) },
  { key: 'roundsPerMessage', label: 'Rounds / msg', numeric: true, read: (row) => DECIMAL.format(row.roundsPerMessage) },
  { key: 'tokens', label: 'Tokens', numeric: true, read: (row) => COUNT.format(row.tokens) },
  { key: 'tokensPerMessage', label: 'Tokens / msg', numeric: true, read: (row) => COUNT.format(Math.round(row.tokensPerMessage)) },
  { key: 'promptTokens', label: 'Prompt', numeric: true, read: (row) => COUNT.format(row.promptTokens) },
  { key: 'completionTokens', label: 'Completion', numeric: true, read: (row) => COUNT.format(row.completionTokens) },
  { key: 'reasoningTokens', label: 'Reasoning', numeric: true, read: (row) => COUNT.format(row.reasoningTokens) },
  { key: 'cachedTokens', label: 'Cached', numeric: true, read: (row) => COUNT.format(row.cachedTokens) },
  { key: 'cacheRate', label: 'Cache hit', numeric: true, read: (row) => RATIO.format(row.cacheRate) },
  { key: 'peakPromptTokens', label: 'Peak prompt', numeric: true, read: (row) => COUNT.format(row.peakPromptTokens) },
  { key: 'cost', label: 'Cost', numeric: true, read: (row) => CURRENCY.format(row.cost) },
  { key: 'costPerMessage', label: 'Cost / msg', numeric: true, read: (row) => CURRENCY.format(row.costPerMessage) },
  { key: 'secondsPerMessage', label: 'Seconds / msg', numeric: true, read: (row) => DECIMAL.format(row.secondsPerMessage) },
  { key: 'slowestMs', label: 'Slowest', numeric: true, read: (row) => `${DECIMAL.format(row.slowestMs / 1000)}s` },
  { key: 'toolShare', label: 'In tools', numeric: true, read: (row) => RATIO.format(row.toolShare) },
  { key: 'toolCalls', label: 'Tool calls', numeric: true, read: (row) => COUNT.format(row.toolCalls) },
  { key: 'toolsPerMessage', label: 'Tools / msg', numeric: true, read: (row) => DECIMAL.format(row.toolsPerMessage) },
  { key: 'toolErrors', label: 'Refused', numeric: true, read: (row) => COUNT.format(row.toolErrors) },
  { key: 'toolErrorRate', label: 'Refused %', numeric: true, read: (row) => RATIO.format(row.toolErrorRate) },
  { key: 'toolsetsOpened', label: 'Sets opened', numeric: true, read: (row) => COUNT.format(row.toolsetsOpened) },
  { key: 'failures', label: 'Failed', numeric: true, read: (row) => COUNT.format(row.failures) },
  { key: 'failureRate', label: 'Failed %', numeric: true, read: (row) => RATIO.format(row.failureRate) },
  { key: 'charsPerMessage', label: 'Chars / reply', numeric: true, read: (row) => COUNT.format(Math.round(row.charsPerMessage)) },
  { key: 'lastUsedAt', label: 'Last used', read: (row) => (row.lastUsedAt ? new Date(row.lastUsedAt).toLocaleDateString() : '—') },
]

function UsageTable() {
  const records = useUsageRecordsStore((store) => store.items)
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: 'tokens', descending: true })
  // Read once and written on every change: leaving the screen and coming back should find
  // the table as it was left.
  const [hidden, setHidden] = useState<Set<SortKey>>(() => new Set(readHiddenColumns() as SortKey[]))
  const [scope, setScope] = useState<string>(ALL_PROFILES)
  const hide = (next: Set<SortKey>) => {
    setHidden(next)
    writeHiddenColumns([...next])
  }
  const shown = COLUMNS.filter((column) => !hidden.has(column.key))

  const rows = useMemo<Row[]>(() => {
    const read = (records as unknown as Partial<UsageRecord>[]).map(asUsageRecord)
    const withDerived = read.map((record) => ({ ...record, ...derived(record) }))
    return withDerived.sort((left, right) => {
      const [a, b] = [left[sort.key], right[sort.key]]
      const order = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
      return sort.descending ? -order : order
    })
  }, [records, sort])

  const everything = useMemo(() => {
    const summed = sumUsage(rows)
    return { ...summed, ...derived(summed), profile: 'Everything', provider: '', model: '', tools: {} } as Row
  }, [rows])

  // Which tools a wording made the model reach for is the comparison, so summing every
  // profile together answers nobody's question once there are two of them.
  const byTool = useMemo(() => {
    const tally: Record<string, { calls: number; errors: number; ms: number }> = {}
    for (const row of rows) {
      if (scope !== ALL_PROFILES && row.profile !== scope) continue
      for (const [name, tool] of Object.entries(row.tools ?? {})) {
        const before = tally[name] ?? { calls: 0, errors: 0, ms: 0 }
        tally[name] = { calls: before.calls + tool.calls, errors: before.errors + tool.errors, ms: before.ms + tool.ms }
      }
    }
    return Object.entries(tally).sort((left, right) => right[1].calls - left[1].calls)
  }, [rows, scope])

  const measured = useMemo(() => [...new Set(rows.map((row) => row.profile))].sort(), [rows])

  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">What each profile has spent</h3>
        <p className="text-muted-foreground text-xs">
          One line per profile, API and model, counted as each message comes back. Click a heading to sort by it; the
          table scrolls sideways, because a metric nobody collected is a question nobody can ask later.
        </p>
      </div>

      {/* Sat against the table rather than up with the heading: they are its controls, and
          they read as part of it only when they are touching it. */}
      <div className="-mb-1 flex items-center justify-end gap-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="xs" variant="outline" className="shrink-0">
              <Columns3 className="mr-1 size-3.5" />
              Columns
              {hidden.size > 0 && <span className="text-muted-foreground ml-1">({COLUMNS.length - hidden.size}/{COLUMNS.length})</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-80 overflow-auto">
            {COLUMNS.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.key}
                checked={!hidden.has(column.key)}
                // The menu stays open: hiding twelve columns should not be twelve trips.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => {
                  const next = new Set(hidden)
                  if (next.has(column.key)) next.delete(column.key)
                  else next.add(column.key)
                  hide(next)
                }}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => hide(new Set())}>Show every column</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* These are measurements, not a bill: an experiment one is done with is meant to
            be cleared. What the chat's own line has counted is a different record in a
            different table, and this leaves it exactly where it was. */}
        <Button
          type="button"
          size="xs"
          variant="outline"
          className="shrink-0"
          disabled={rows.length === 0}
          title="Clears every measurement in this table. The lifetime total the chat shows is kept."
          onClick={() => void resetProfileUsage()}
        >
          <RotateCcw className="mr-1 size-3.5" /> Start measuring again
        </Button>
      </div>
      <div className="overflow-auto rounded-md border">
        <table className="w-max min-w-full text-xs">
          <thead className="bg-muted/40">
            <tr>
              {shown.map((column) => (
                <th
                  key={column.key}
                  className={cn('cursor-pointer p-2 font-medium whitespace-nowrap select-none', column.numeric ? 'text-right' : 'text-left')}
                  onClick={() => setSort({ key: column.key, descending: sort.key === column.key ? !sort.descending : true })}
                >
                  {column.label}
                  {sort.key === column.key && <span className="text-muted-foreground"> {sort.descending ? '▼' : '▲'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={shown.length} className="text-muted-foreground p-3 text-center">Nothing has been sent yet.</td></tr>
            )}
            {rows.map((row) => (
              <tr key={`${row.profile}/${row.provider}/${row.model}`} className="border-t">
                {shown.map((column) => (
                  <td key={column.key} className={cn('p-2 whitespace-nowrap', column.numeric && 'text-right tabular-nums')}>
                    {column.read(row)}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length > 1 && (
              <tr className="border-t font-medium">
                {shown.map((column) => (
                  <td key={column.key} className={cn('p-2 whitespace-nowrap', column.numeric && 'text-right tabular-nums')}>
                    {column.key === 'provider' || column.key === 'model' ? '' : column.read(everything)}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {rows.length > 0 && (
        <div className="mt-1 flex items-center justify-between gap-3">
          <p className="text-muted-foreground text-xs">
            Which tools were reached for, and how often they refused.
          </p>
          {/* A button rather than a select, so it is the same control as the two above it:
              a trigger sized by its own component is a trigger that will not match them. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" size="xs" variant="outline" className="shrink-0">
                <Users className="mr-1 size-3.5" />
                {scope === ALL_PROFILES ? 'Every profile' : scope}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
                <DropdownMenuRadioItem value={ALL_PROFILES}>Every profile together</DropdownMenuRadioItem>
                {measured.map((profile) => (
                  <DropdownMenuRadioItem key={profile} value={profile}>{profile}</DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {byTool.length > 0 && (
        <div className="overflow-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/40">
              <tr>
                <th className="p-2 text-left font-medium">Tool</th>
                <th className="p-2 text-right font-medium">Calls</th>
                <th className="p-2 text-right font-medium">Refused</th>
                <th className="p-2 text-right font-medium">Refused %</th>
                <th className="p-2 text-right font-medium">Total time</th>
                <th className="p-2 text-right font-medium">Avg</th>
              </tr>
            </thead>
            <tbody>
              {byTool.map(([name, tool]) => (
                <tr key={name} className="border-t">
                  <td className="p-2 font-mono">{name}</td>
                  <td className="p-2 text-right tabular-nums">{COUNT.format(tool.calls)}</td>
                  <td className="p-2 text-right tabular-nums">{COUNT.format(tool.errors)}</td>
                  <td className="p-2 text-right tabular-nums">{RATIO.format(tool.calls > 0 ? tool.errors / tool.calls : 0)}</td>
                  <td className="p-2 text-right tabular-nums">{DECIMAL.format(tool.ms / 1000)}s</td>
                  <td className="p-2 text-right tabular-nums">{COUNT.format(Math.round(tool.ms / Math.max(1, tool.calls)))}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function ProfileEditor() {
  const profiles = useAssistantProfilesStore((store) => store.items) as unknown as ({ id: number } & AssistantProfile)[]
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const connections = useAssistantConfigStore((store) => store.items)

  const active = profiles.find((profile) => profile.isActive) ?? null
  const entries = useMemo(() => promptRegistry(), [])
  // The two documents a user could edit before profiles existed are still stored, and are
  // still what the default sends; showing the code's wording instead would be a lie about
  // what the next message carries.
  const saved = useAssistantPromptsStore((store) => store.items)
  const savedText = (key: string) => saved.find((prompt) => prompt.key === key)?.content
  // Every box grows to fit what is in it, and no box grows past the system prompt's own
  // height: one field decides how much of this screen any single instruction may take, and
  // it is the one everybody reads first.
  const [tallest, setTallest] = useState<number | null>(null)

  /**
   * A profile edits its own copy; the default edits the app's own list.
   *
   * The default's connections are editable even though its wording is not — a key has to
   * be set up somewhere, and that somewhere is here. What a profile does to its copy
   * reaches nobody else.
   */
  const backing: ConnectionsBacking | undefined = useMemo(() => {
    if (!active) return undefined
    const rows = (active.connections ?? []).map((entry) => ({ createdAt: 0, ...entry }))
    const write = (next: (AssistantConfig & { id: number })[]) => setProfileConnections(active.id, next)
    return {
      items: rows,
      isLoading: false,
      addItem: (value) => write([...rows, { ...value, id: Math.max(0, ...rows.map((row) => row.id)) + 1 }]),
      updateItem: (id, value) => write(rows.map((row) => (row.id === id ? { ...value, id } : row))),
      deleteItem: (id) => write(rows.filter((row) => row.id !== id)),
    }
  }, [active])

  async function attempt(action: () => Promise<unknown>) {
    try { await action(); setMessage(null) }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)) }
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="text-sm font-medium">Profile</h3>
        <p className="text-muted-foreground text-xs">
          Everything the assistant is told, under one name. Default is the wording in the app itself and cannot be
          edited; a new profile starts as a copy of whatever is selected, and what it says differently is all it stores.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={active ? String(active.id) : DEFAULT_PROFILE}
          onValueChange={(value) => void attempt(() => selectProfile(value === DEFAULT_PROFILE ? null : Number(value)))}
        >
          <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_PROFILE}>{DEFAULT_PROFILE}</SelectItem>
            {profiles.map((profile) => <SelectItem key={profile.id} value={String(profile.id)}>{profile.name}</SelectItem>)}
          </SelectContent>
        </Select>

        {naming ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault()
              void attempt(async () => {
                // A new profile starts as a copy of what is selected — its wordings and the
                // connection it was sending under — so an experiment changes one thing.
                await createProfile(
                  name,
                  active?.overrides ?? {},
                  active?.connections ?? connections.map((entry) => ({ ...entry })),
                )
                setName('')
                setNaming(false)
              })
            }}
          >
            <Input autoFocus value={name} placeholder="Name it" className="h-8 w-44 text-xs" onChange={(event) => setName(event.target.value)} />
            <Button type="submit" size="xs">Create</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => { setNaming(false); setName('') }}>Cancel</Button>
          </form>
        ) : (
          <Button type="button" size="xs" variant="outline" onClick={() => setNaming(true)}>
            <Plus className="mr-1 size-3.5" /> New profile
          </Button>
        )}

        {active && (
          <Button type="button" size="xs" variant="ghost" className="text-destructive" onClick={() => void attempt(() => deleteProfile(active.id))}>
            <Trash2 className="mr-1 size-3.5" /> Delete {active.name}
          </Button>
        )}
      </div>

      {message && <p className="text-destructive text-xs">{message}</p>}

      {/* The connections belong to the profile too: it is the whole experiment under one
          name, and the key and model are half of what an experiment is. */}
      <ConnectionsSection backing={backing} />

      <p className="text-muted-foreground text-xs">
        {active
          ? `Everything below is what "${active.name}" says. A box left as it arrived says what the default says; edit one and only that difference is stored.`
          : "Default is the app's own wording, shown here to read. Create a profile to change any of it."}
      </p>

      <div className="flex flex-col gap-5">
        {SECTIONS.map((section) => (
          <div key={section} className="flex flex-col gap-2">
            <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">{section}</h4>
            {entries.filter((entry) => entry.section === section).map((entry) => (
              <PromptField
                key={entry.key}
                profileId={active?.id ?? null}
                entry={entry}
                fallback={savedText(entry.key) ?? entry.fallback}
                override={active?.overrides[entry.key] ?? ''}
                maxHeight={tallest}
                onNaturalHeight={entry.key === SYSTEM_PROMPT_KEY ? setTallest : undefined}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

/**
 * One prompt, under whichever profile is selected.
 *
 * The default is shown rather than hidden — it is what the next message carries, and a
 * wording cannot be improved by someone who has to guess at it — but it is not editable,
 * because it is the code's own text. A profile shows the same words to begin with, and
 * stores only the ones it changes; resetting a field is deleting that difference.
 *
 * A placeholder dropped from the text turns the box red and stops the next message being
 * sent: the model would otherwise be told to use labels without being told which exist,
 * and that is worth catching before it is paid for.
 */
function PromptField({ profileId, entry, fallback, override, maxHeight, onNaturalHeight }: {
  profileId: number | null
  entry: PromptEntry
  fallback: string
  override: string
  /** The tallest any box may be, in pixels: the system prompt's own height. */
  maxHeight: number | null
  /** Only the system prompt reports back, because it is what the cap is. */
  onNaturalHeight?: (height: number) => void
}) {
  const editable = profileId !== null
  const box = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(override || fallback)
  // A different profile is a different text in the same box.
  const [shownFor, setShownFor] = useState(profileId)
  if (shownFor !== profileId) {
    setShownFor(profileId)
    setDraft(override || fallback)
  }

  const placeholders = requiredPlaceholders(entry.fallback)
  const broken = editable && draft.trim() ? brokenPlaceholders(entry, draft) : []
  const changed = editable && draft.trim() !== fallback.trim()

  // Measured rather than guessed: a textarea only reports the height its content wants
  // while it is not being held to one, so it is released, read, and then held again.
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    element.style.height = 'auto'
    const natural = element.scrollHeight
    onNaturalHeight?.(natural)
    element.style.height = `${maxHeight ? Math.min(natural, maxHeight) : natural}px`
  }, [draft, maxHeight, onNaturalHeight])

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-xs font-medium">
          {entry.label}
          {changed && <span className="text-brand ml-1 text-[11px]">edited</span>}
        </label>
        <span className="text-muted-foreground flex items-center gap-2 text-[11px]">
          {placeholders.length > 0 && <span className="font-mono">{placeholders.join(' ')}</span>}
          ~{entry.size} tokens
          <Button
            type="button"
            size="xs"
            variant="ghost"
            // Kept on the default rather than hidden, so the control does not move about
            // between profiles; faded, because there is nothing there to reset.
            disabled={!editable || !changed}
            className={cn(!editable && 'opacity-40')}
            title="Put this field back to the default wording"
            onClick={() => {
              setDraft(fallback)
              if (profileId !== null) void setOverride(profileId, entry.key, '')
            }}
          >
            <RotateCcw className="size-3.5" />
          </Button>
        </span>
      </div>
      <Textarea
        ref={box}
        value={draft}
        readOnly={!editable}
        rows={1}
        className={cn(
          // The base textarea keeps a four-line floor and sizes itself to its content;
          // both are undone here, because the height is measured and set below — a
          // one-line description should be one line tall.
          'field-sizing-fixed min-h-0 resize-none overflow-y-auto font-mono text-xs',
          !editable && 'text-muted-foreground bg-muted/30',
          broken.length > 0 && 'border-destructive focus-visible:ring-destructive',
        )}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          if (profileId === null) return
          // Saying the same as the default is not a difference worth storing.
          void setOverride(profileId, entry.key, draft.trim() === fallback.trim() ? '' : draft)
        }}
      />
      {broken.length > 0 && (
        <p className="text-destructive text-[11px]">
          Missing {broken.join(' and ')}. Put {broken.length > 1 ? 'them' : 'it'} back, or reset the field —
          no message can be sent while this is missing.
        </p>
      )}
    </div>
  )
}

const SECTIONS = ['Instructions', 'Tool sets', 'Tools'] as const
