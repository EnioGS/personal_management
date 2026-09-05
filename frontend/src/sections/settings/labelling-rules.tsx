import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { labelRulesWithStats } from '@/lib/model/label-rules-repository'
import { deleteLabelRule } from '@/lib/model/label-rules-repository'
import { useLabelRulesStore } from '@/lib/model/model-stores'
import type { RuleContext } from '@/lib/model/types'
import type { RuleStats, StoredRule } from '@/lib/model/label-rules'

const MATCH_LABEL: Record<NonNullable<StoredRule['match']>, string> = {
  contains: 'contains',
  equals: 'is exactly',
  startsWith: 'starts with',
  regex: 'matches',
}

function describeLabels(rule: StoredRule): string {
  const parts: string[] = []
  if (rule.labels.sections?.length) parts.push(`sections: ${rule.labels.sections.join(', ')}`)
  if (rule.labels.screens?.length) parts.push(`screens: ${rule.labels.screens.join(', ')}`)
  if (rule.labels.category) parts.push(`category: ${rule.labels.category}`)
  if (rule.labels.subcategory) parts.push(`subcategory: ${rule.labels.subcategory}`)
  return parts.join(' · ')
}

function describeConditions(rule: StoredRule): string {
  return [rule, ...(rule.where ?? [])]
    .map((condition) => `${condition.field} ${MATCH_LABEL[condition.match ?? 'contains']} "${condition.contains}"`)
    .join(' and ')
}

/**
 * The standing rules of one stage.
 *
 * A rule belongs to the stage it was written for and is never shown outside it: a rule
 * that labels files as they arrive has nothing to say about rows already in a table, and
 * showing both together is how somebody edits the wrong one.
 */
export function LabellingRules({ context }: { context: RuleContext }) {
  const rules = useLabelRulesStore((store) => store.items)
  const [withStats, setWithStats] = useState<{ rule: StoredRule; stats: RuleStats }[]>([])

  const refresh = useCallback(async () => {
    setWithStats(await labelRulesWithStats(context))
  }, [context])

  useEffect(() => { void refresh() }, [refresh, rules])

  async function remove(id: number) {
    await deleteLabelRule(id)
    await refresh()
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm font-medium">
          {context === 'source' ? 'Rules applied as a file arrives' : 'Rules applied to confirmed rows'}
        </h3>
        <p className="text-muted-foreground text-xs">
          A rule fills only what a row does not already say, so it never overwrites a decision. The assistant writes
          these as it works; delete any that turn out wrong — the rows they already labelled keep their labels.
        </p>
      </div>

      {withStats.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">No rules for this stage yet.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {withStats.map(({ rule, stats }) => (
            <div key={rule.id} className="flex items-start justify-between gap-3 p-3 text-xs">
              <div className="min-w-0">
                <p className="font-medium">{rule.name || rule.contains}</p>
                <p className="text-muted-foreground">{describeConditions(rule)}</p>
                <p>{describeLabels(rule)}</p>
                {rule.rationale && <p className="text-muted-foreground mt-1 italic">{rule.rationale}</p>}
                <p className="text-muted-foreground mt-1">
                  {`by ${rule.createdBy} · ${stats.applied} labelled · ${stats.confirmedRespected} kept · ${stats.overridden} overridden`}
                </p>
              </div>
              <Button type="button" size="xs" variant="ghost" onClick={() => void remove(rule.id)} aria-label="Delete rule">
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
