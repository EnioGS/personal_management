import { useCallback, useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildLabelCatalogue } from '@/lib/label-catalogue-source'
import { parsePlacementLabels, resolveScreenLabel, resolveSectionLabel, withDerivedSections } from '@/lib/model/label-catalogue'
import { applyLabelRulesToRows, deleteLabelRule, labelRulesWithStats, saveLabelRule } from '@/lib/model/label-rules-repository'
import { useLabelRulesStore } from '@/lib/model/model-stores'
import type { IngestionRowLabels, LabelRule, RuleContext } from '@/lib/model/types'
import type { RuleStats, StoredRule } from '@/lib/model/label-rules'

const MATCH_LABEL: Record<NonNullable<StoredRule['match']>, string> = {
  contains: 'contains',
  equals: 'is exactly',
  startsWith: 'starts with',
  regex: 'matches',
}

interface Draft {
  name: string
  field: string
  contains: string
  match: NonNullable<StoredRule['match']>
  sections: string
  screens: string
  category: string
  subcategory: string
  rationale: string
}

/** A source rule reads the file's own columns; a confirmed one reads the row's observations. */
function emptyDraft(context: RuleContext): Draft {
  return {
    name: '',
    field: context === 'source' ? 'description' : 'observations',
    contains: '',
    match: 'contains',
    sections: '',
    screens: '',
    category: '',
    subcategory: '',
    rationale: '',
  }
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
  const { t } = useTranslation()
  const rules = useLabelRulesStore((store) => store.items)
  const [withStats, setWithStats] = useState<{ rule: StoredRule; stats: RuleStats }[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setWithStats(await labelRulesWithStats(context))
  }, [context])

  useEffect(() => { void refresh() }, [refresh, rules])

  async function remove(id: number) {
    await deleteLabelRule(id)
    await refresh()
  }

  /**
   * Saving a rule by hand. The assistant writes these too, through a tool that validates
   * the same things — a rule needs a rationale, a usable pattern and labels that name
   * something, whoever is writing it.
   */
  async function save() {
    if (!draft) return
    const catalogue = buildLabelCatalogue((key) => String(t(key as never)))
    if (!draft.contains.trim()) { setError('Say what text the rule matches.'); return }
    if (!draft.rationale.trim()) { setError('Say why these labels are right for everything matching it.'); return }
    if (draft.match === 'regex') {
      try { new RegExp(draft.contains) } catch { setError(`"${draft.contains}" is not a usable regular expression.`); return }
    }

    const sections = parsePlacementLabels(draft.sections, (value) => resolveSectionLabel(catalogue, value))
    const screens = parsePlacementLabels(draft.screens, (value) => resolveScreenLabel(catalogue, value, sections.values))
    const unknown = [...sections.unknown, ...screens.unknown]
    if (unknown.length > 0) { setError(`Nothing is called ${unknown.join(', ')}.`); return }

    const labels: IngestionRowLabels = withDerivedSections({
      ...(sections.values.length ? { sections: sections.values } : {}),
      ...(screens.values.length ? { screens: screens.values } : {}),
      ...(draft.category.trim() ? { category: draft.category.trim() } : {}),
      ...(draft.subcategory.trim() ? { subcategory: draft.subcategory.trim() } : {}),
    }, catalogue)
    if (Object.keys(labels).length === 0) { setError('A rule has to set at least one label.'); return }

    await saveLabelRule({
      context,
      name: draft.name.trim() || undefined,
      field: draft.field.trim() || 'description',
      contains: draft.contains.trim(),
      match: draft.match,
      labels,
      rationale: draft.rationale.trim(),
      createdBy: 'user',
      createdAt: Date.now(),
    } satisfies LabelRule)
    await applyLabelRulesToRows(context, (key) => String(t(key as never)))
    setDraft(null)
    setError(null)
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

      {draft ? (
        <div className="flex flex-col gap-2 rounded-md border p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <Input value={draft.name} placeholder="name (optional)" className="h-7 w-40 text-xs" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <Input value={draft.field} placeholder="column" className="h-7 w-40 text-xs" onChange={(event) => setDraft({ ...draft, field: event.target.value })} />
            <Select value={draft.match} onValueChange={(value) => setDraft({ ...draft, match: value as Draft['match'] })}>
              <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="text-xs">
                {(Object.keys(MATCH_LABEL) as (keyof typeof MATCH_LABEL)[]).map((mode) => (
                  <SelectItem key={mode} value={mode}>{MATCH_LABEL[mode]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input value={draft.contains} placeholder="text to look for" className="h-7 w-56 text-xs" onChange={(event) => setDraft({ ...draft, contains: event.target.value })} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input value={draft.sections} placeholder="sections" className="h-7 w-40 text-xs" onChange={(event) => setDraft({ ...draft, sections: event.target.value })} />
            <Input value={draft.screens} placeholder="screens" className="h-7 w-40 text-xs" onChange={(event) => setDraft({ ...draft, screens: event.target.value })} />
            <Input value={draft.category} placeholder="category" className="h-7 w-32 text-xs" onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
            <Input value={draft.subcategory} placeholder="subcategory" className="h-7 w-32 text-xs" onChange={(event) => setDraft({ ...draft, subcategory: event.target.value })} />
          </div>
          <Input value={draft.rationale} placeholder="why these labels are right for everything matching this" className="h-7 text-xs" onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} />
          {error && <p className="text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button type="button" size="xs" onClick={() => void save()}>Save and apply</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => { setDraft(null); setError(null) }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" size="xs" variant="outline" className="self-start" onClick={() => setDraft(emptyDraft(context))}>
          <Plus className="mr-1 size-3.5" /> New rule
        </Button>
      )}

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
