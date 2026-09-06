import { useCallback, useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { refreshAllLocalStores } from '@/lib/local-store/create-local-list-store'
import { RETENTION_MS, listTurns, undoTurn, type JournalTurn } from '@/lib/journal/journal'
import { JOURNALLED_TABLES } from '@/lib/model/model-db'
import { cn } from '@/lib/utils'

const WHO: Record<JournalTurn['origin'], string> = {
  user: 'You',
  assistant: 'The assistant',
  sql: 'SQL',
  system: 'The app',
}

/**
 * What has changed, and how to put it back.
 *
 * The counts are the point. A turn that deleted eight hundred rows says so here whether
 * or not anybody was watching when it happened — which is the difference between a change
 * being recoverable and it being recovered. Undo is offered per turn because that is the
 * granularity anybody wants: not one row, and not everything since Tuesday, but the whole
 * of what one message did.
 */
export function HistoryPanel() {
  const [turns, setTurns] = useState<JournalTurn[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = useCallback(async () => setTurns(await listTurns()), [])
  useEffect(() => { void reload() }, [reload])

  async function undo(turn: JournalTurn) {
    setBusy(turn.turnId)
    try {
      const result = await undoTurn(turn.turnId, JOURNALLED_TABLES as never)
      await refreshAllLocalStores()
      setMessage(
        result.skipped.length === 0
          ? `Put back ${result.restored} row(s).`
          : `Put back ${result.restored} row(s). Left alone: ${result.skipped.join('; ')}.`,
      )
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(null)
      await reload()
    }
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-auto p-4">
      <div>
        <h3 className="text-sm font-medium">What has changed</h3>
        <p className="text-muted-foreground text-xs">
          Every change made through this app, grouped by what made it, kept for{' '}
          {Math.round(RETENTION_MS / (24 * 60 * 60 * 1000))} days. Undo puts a whole turn back; a row somebody has
          touched since is left alone and named, rather than overwritten.
        </p>
      </div>

      {message && <p className="text-xs">{message}</p>}

      {turns.length === 0 ? (
        <p className="text-muted-foreground text-xs">Nothing has changed yet.</p>
      ) : (
        <div className="flex flex-col divide-y overflow-hidden rounded-md border">
          {turns.map((turn) => (
            <div
              key={turn.turnId}
              // Something that happened inside a message is indented under it, so the
              // message reads as a whole and each thing it did is still its own line.
              className={cn('flex items-start justify-between gap-3 p-2.5', turn.parentId && 'border-l-2 pl-4')}
            >
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {WHO[turn.origin]}
                  {turn.profile && <span className="text-muted-foreground font-normal"> · {turn.profile}</span>}
                  <span className="text-muted-foreground font-normal"> · {new Date(turn.at).toLocaleString()}</span>
                </p>
                {turn.label && <p className="text-muted-foreground truncate text-xs">{turn.label}</p>}
                {turn.statement && (
                  <p className="text-muted-foreground font-mono text-[11px] break-all">{turn.statement}</p>
                )}
                <p className="text-muted-foreground text-[11px]">
                  {Object.entries(turn.counts).map(([table, counts]) => (
                    <span key={table} className="mr-3">
                      {table}: {[
                        counts.insert > 0 && `${counts.insert} added`,
                        counts.update > 0 && `${counts.update} changed`,
                        counts.delete > 0 && `${counts.delete} deleted`,
                      ].filter(Boolean).join(', ')}
                    </span>
                  ))}
                </p>
              </div>
              <Button
                type="button"
                size="xs"
                variant="outline"
                className="shrink-0"
                disabled={busy === turn.turnId}
                onClick={() => void undo(turn)}
              >
                <Undo2 className="mr-1 size-3.5" /> Undo
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
