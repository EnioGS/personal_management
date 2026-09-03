import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { applyLabelRulesToRows, deleteLabelRule, labelRulesWithStats, saveLabelRule, updateLabelRule } from '@/lib/model/label-rules-repository'
import { FINANCE_DESTINATIONS, FLOW_ROLES, labelValues, matchLabelValue, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS } from '@/lib/model/label-vocabulary'
import type { RuleStats, StoredRule } from '@/lib/model/label-rules'
import { useCategoriesStore, useIngestionRowsStore, useTableDefsStore } from '@/lib/model/model-stores'
import type { IngestionRowLabels, LabelRule } from '@/lib/model/types'

interface RuleWithStats { rule: StoredRule; stats: RuleStats }

const BLANK_DRAFT = { name: '', contains: '', rationale: '', financeDestination: '', flowRole: '', settlementChannel: '', spendingTreatment: '', recurrence: '', category: '', destinationTable: '' }

/**
 * Standing rules, listed one line each. A rule is a decision that outlives the batch
 * it was written for, so the list leads with what it matches and what it sets, and the
 * detail dialog carries the rationale and the record of how the rule has actually
 * fared — including rows whose labels were changed before confirmation, which is the
 * number that says a rule is wrong.
 */
export function LabellingRules({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const rowStore = useIngestionRowsStore((store) => store.items)
  const categories = useCategoriesStore((store) => store.items)
  const addCategory = useCategoriesStore((store) => store.addItem)
  const tableDefs = useTableDefsStore((store) => store.items)
  const [rules, setRules] = useState<RuleWithStats[]>([])
  const [openRule, setOpenRule] = useState<RuleWithStats | null>(null)
  const [draft, setDraft] = useState<typeof BLANK_DRAFT | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  // Stats are computed from the rows, so the list refreshes whenever they change.
  useEffect(() => { void labelRulesWithStats().then(setRules) }, [rowStore])

  const tableByName = useMemo(() => new Map(tableDefs.map((table) => [table.name.trim().toLowerCase(), table.id])), [tableDefs])

  async function reload() {
    setRules(await labelRulesWithStats())
    await onChanged()
  }

  async function saveDraft() {
    if (!draft) return
    if (!draft.contains.trim() || !draft.rationale.trim()) {
      setMessage('A rule needs the text it matches and a rationale.')
      return
    }
    const categoryName = draft.category.trim()
    const existing = categories.find((category) => category.name.trim().toLowerCase() === categoryName.toLowerCase())
    const categoryId = categoryName ? (existing?.id ?? (await addCategory({ name: categoryName }))) : undefined
    const labels: IngestionRowLabels = {
      ...(matchLabelValue(FINANCE_DESTINATIONS, draft.financeDestination) ? { financeDestination: matchLabelValue(FINANCE_DESTINATIONS, draft.financeDestination) } : {}),
      ...(matchLabelValue(FLOW_ROLES, draft.flowRole) ? { flowRole: matchLabelValue(FLOW_ROLES, draft.flowRole) } : {}),
      ...(matchLabelValue(SETTLEMENT_CHANNELS, draft.settlementChannel) ? { settlementChannel: matchLabelValue(SETTLEMENT_CHANNELS, draft.settlementChannel) } : {}),
      ...(matchLabelValue(SPENDING_TREATMENTS, draft.spendingTreatment) ? { spendingTreatment: matchLabelValue(SPENDING_TREATMENTS, draft.spendingTreatment) } : {}),
      ...(matchLabelValue(RECURRENCES, draft.recurrence) ? { recurrence: matchLabelValue(RECURRENCES, draft.recurrence) } : {}),
      ...(categoryId ? { categoryId } : {}),
    }
    const destinationTableId = tableByName.get(draft.destinationTable.trim().toLowerCase())
    if (Object.keys(labels).length === 0 && destinationTableId === undefined) {
      setMessage('A rule has to set at least one label or a destination table.')
      return
    }
    const rule: LabelRule = { name: draft.name.trim() || undefined, field: 'description', contains: draft.contains.trim(), labels, destinationTableId, rationale: draft.rationale.trim(), createdBy: 'user', createdAt: Date.now() }
    await saveLabelRule(rule)
    const applied = await applyLabelRulesToRows()
    setDraft(null)
    setMessage(`Rule saved. It filled ${applied.rowsTouched} waiting row(s); ${applied.becameReady} became ready.`)
    await reload()
  }

  async function saveRationale(entry: RuleWithStats, rationale: string) {
    const { id: _id, ...rule } = entry.rule
    await updateLabelRule(entry.rule.id, { ...rule, rationale })
    await reload()
  }

  async function removeRule(entry: RuleWithStats) {
    await deleteLabelRule(entry.rule.id)
    setOpenRule(null)
    setMessage(`Removed "${entry.rule.name || entry.rule.contains}". The rows it labelled keep their labels.`)
    await reload()
  }

  function summarise(rule: StoredRule): string {
    const labels = [rule.labels.financeDestination, rule.labels.flowRole, rule.labels.settlementChannel, rule.labels.spendingTreatment, rule.labels.recurrence].filter(Boolean)
    const table = rule.destinationTableId ? tableDefs.find((candidate) => candidate.id === rule.destinationTableId)?.name : undefined
    return [...labels, ...(table ? [table] : [])].join(' · ') || 'no labels'
  }

  return (
    <section className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-medium">Labelling rules</h3>
          <p className="text-muted-foreground text-xs">A rule labels every future row whose description contains its text, filling only what a row does not already have.</p>
        </div>
        <Button type="button" size="xs" variant="outline" onClick={() => { setDraft(BLANK_DRAFT); setMessage(null) }}><Plus className="size-3" />Add a rule</Button>
      </div>

      {message && <p className="text-muted-foreground text-xs">{message}</p>}

      {rules.length === 0 && !draft && <p className="text-muted-foreground text-xs">No rules yet. The assistant will offer to save one when it finds a pattern worth keeping, or you can write one here.</p>}

      <div className="flex flex-col divide-y">
        {rules.map((entry) => (
          <button key={entry.rule.id} type="button" onClick={() => setOpenRule(entry)} className="hover:bg-muted/50 flex items-center justify-between gap-3 py-1.5 text-left text-xs">
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{entry.rule.name || entry.rule.contains}</span>
              <span className="text-muted-foreground"> · contains "{entry.rule.contains}" → {summarise(entry.rule)}</span>
            </span>
            <span className="text-muted-foreground shrink-0">{entry.stats.confirmedRespected} confirmed{entry.stats.overridden > 0 && ` · ${entry.stats.overridden} overridden`}</span>
          </button>
        ))}
      </div>

      {draft && (
        <div className="flex flex-col gap-2 rounded-md border p-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Name (optional)" className="h-7 text-xs" />
            <Input value={draft.contains} onChange={(event) => setDraft({ ...draft, contains: event.target.value })} placeholder="Description contains…" className="h-7 text-xs" />
            <Input value={draft.financeDestination} onChange={(event) => setDraft({ ...draft, financeDestination: event.target.value })} placeholder={`destination: ${labelValues(FINANCE_DESTINATIONS).join(' | ')}`} className="h-7 text-xs" />
            <Input value={draft.flowRole} onChange={(event) => setDraft({ ...draft, flowRole: event.target.value })} placeholder={`flow role: ${labelValues(FLOW_ROLES).join(' | ')}`} className="h-7 text-xs" />
            <Input value={draft.settlementChannel} onChange={(event) => setDraft({ ...draft, settlementChannel: event.target.value })} placeholder="settlement channel" className="h-7 text-xs" />
            <Input value={draft.spendingTreatment} onChange={(event) => setDraft({ ...draft, spendingTreatment: event.target.value })} placeholder="spending treatment" className="h-7 text-xs" />
            <Input value={draft.recurrence} onChange={(event) => setDraft({ ...draft, recurrence: event.target.value })} placeholder="recurrence" className="h-7 text-xs" />
            <Input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="category (a new name creates it)" className="h-7 text-xs" />
            <Input value={draft.destinationTable} onChange={(event) => setDraft({ ...draft, destinationTable: event.target.value })} placeholder="destination table" className="h-7 text-xs" />
          </div>
          <Textarea value={draft.rationale} onChange={(event) => setDraft({ ...draft, rationale: event.target.value })} placeholder="Why these labels are right for everything matching this text" className="h-20 resize-none text-xs" />
          <div className="flex gap-2">
            <Button type="button" size="xs" onClick={() => void saveDraft()}>Save rule</Button>
            <Button type="button" size="xs" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      )}

      <Dialog open={!!openRule} onOpenChange={(open) => !open && setOpenRule(null)}>
        <DialogContent className="max-h-[80vh] overflow-auto">
          {openRule && (
            <>
              <DialogHeader>
                <DialogTitle>{openRule.rule.name || openRule.rule.contains}</DialogTitle>
                <DialogDescription>
                  Matches {openRule.rule.field} containing "{openRule.rule.contains}" → {summarise(openRule.rule)}. Created by {openRule.rule.createdBy}.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-3 text-xs">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <Figure label="Filled by this rule" value={openRule.stats.applied} />
                  <Figure label="Confirmed, labels intact" value={openRule.stats.confirmedRespected} />
                  <Figure label="Changed before confirming" value={openRule.stats.overridden} />
                </div>
                <p className="text-muted-foreground">{openRule.stats.pending} row(s) it filled are still waiting to be confirmed.</p>
                <div>
                  <p className="mb-1 font-medium">Rationale</p>
                  <Textarea
                    key={openRule.rule.id}
                    defaultValue={openRule.rule.rationale ?? ''}
                    onBlur={(event) => void saveRationale(openRule, event.target.value)}
                    placeholder="Why these labels are right for everything matching this text"
                    className="h-28 resize-none text-xs"
                  />
                </div>
                <div>
                  <p className="mb-1 font-medium">Strings it matched ({openRule.stats.matchedStrings.length})</p>
                  <ul className="text-muted-foreground max-h-40 overflow-auto">
                    {openRule.stats.matchedStrings.map((text) => <li key={text} className="truncate" title={text}>{text}</li>)}
                    {openRule.stats.matchedStrings.length === 0 && <li>Nothing yet — it will apply to rows imported from now on.</li>}
                  </ul>
                </div>
                <div>
                  <Button type="button" size="xs" variant="outline" onClick={() => void removeRule(openRule)}><Trash2 className="size-3" />Delete this rule</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border p-2">
      <p className="text-lg font-medium">{value}</p>
      <p className="text-muted-foreground">{label}</p>
    </div>
  )
}
