import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { computePositions, type Transaction } from '@/lib/current-value'
import { useAllocationTargetsStore } from '@/lib/model/model-stores'
import { useEntriesOfKinds } from '@/lib/model/use-model-data'
import { cn } from '@/lib/utils'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

/** Target vs. actual portfolio share per asset, with the rebalancing delta highlighted. */
export function AllocationPanel({ embedded = false }: { embedded?: boolean }) {
  const { t } = useTranslation(['investments', 'common'])
  const rows = useEntriesOfKinds(['investmentLedger'])
  const positions = computePositions(rows as unknown as Transaction[])
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0)

  const targets = useAllocationTargetsStore((s) => s.items)
  const addTarget = useAllocationTargetsStore((s) => s.addItem)
  const updateTarget = useAllocationTargetsStore((s) => s.updateItem)
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  async function saveTarget(asset: string, value: string) {
    const percent = Number(value)
    if (!Number.isFinite(percent) || percent < 0) return
    const existing = targets.find((t) => t.asset === asset)
    if (existing) await updateTarget(existing.id, { asset, targetPercent: percent })
    else await addTarget({ asset, targetPercent: percent })
    setDrafts((d) => {
      const next = { ...d }
      delete next[asset]
      return next
    })
  }

  // Every asset held, plus every asset with a target but no current position — a
  // target you're meant to be building toward from zero is still worth showing.
  const assets = [...new Set([...positions.map((p) => p.asset), ...targets.map((t) => t.asset)])]

  return (
    <div className={`flex h-full flex-col gap-3 ${embedded ? '' : 'p-4'}`}>
      {!embedded && <div>
        <h2 className="text-sm font-medium">{t('items.allocation')}</h2>
        <p className="text-muted-foreground text-xs">{t('allocation.description')}</p>
      </div>}

      {assets.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('allocation.noAssets')}</p>
      ) : (
        <div className="flex flex-col divide-y overflow-auto rounded-md border">
          {assets.map((asset) => {
            const position = positions.find((p) => p.asset === asset)
            const actualPercent = totalValue > 0 ? ((position?.currentValue ?? 0) / totalValue) * 100 : 0
            const target = targets.find((t) => t.asset === asset)
            const targetPercent = target?.targetPercent ?? 0
            const delta = actualPercent - targetPercent
            const isOff = target && Math.abs(delta) >= 1

            return (
              <div key={asset} className="flex items-center justify-between gap-2 p-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{asset}</p>
                  {position && (
                    <p className="text-muted-foreground text-xs">{currency.format(position.currentValue)}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs">
                    {t('allocation.actual')}: <span className="font-medium tabular-nums">{formatPercent(actualPercent)}</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground text-xs">{t('allocation.target')}:</span>
                    <Input
                      type="number"
                      value={drafts[asset] ?? (target ? String(target.targetPercent) : '')}
                      placeholder="%"
                      className="h-7 w-16 text-xs"
                      onChange={(e) => setDrafts((d) => ({ ...d, [asset]: e.target.value }))}
                      onBlur={(e) => e.target.value && void saveTarget(asset, e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && void saveTarget(asset, (e.target as HTMLInputElement).value)}
                    />
                  </div>
                  {target && (
                    <span className={cn('w-16 text-right text-xs tabular-nums', isOff && 'text-destructive font-medium')}>
                      {delta > 0 ? '+' : ''}
                      {formatPercent(delta)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
