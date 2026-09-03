import { applyLabelRulesToRows, deleteLabelRule, labelRulesWithStats, saveLabelRule } from '@/lib/model/label-rules-repository'
import { ensureCategoryByName } from '@/lib/model/category-vocabulary'
import { FLOW_ROLES, labelValues, matchLabelValue, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS } from '@/lib/model/label-vocabulary'
import { parsePlacementLabels, resolveSectionLabel, resolveSubsectionLabel } from '@/lib/model/label-catalogue'
import { buildLabelCatalogue } from '@/lib/label-catalogue-source'
import { INGESTION_QUERY_FIELDS } from '@/lib/model/ingestion-fields'
import type { IngestionRowLabels, LabelRule } from '@/lib/model/types'
import type { ToolDefinition } from './types'

async function labelsFromArgs(update: Record<string, unknown>, translate: (key: string) => string): Promise<IngestionRowLabels> {
  const catalogue = buildLabelCatalogue(translate)
  const text = (field: string) => (typeof update[field] === 'string' ? (update[field] as string) : undefined)
  const categoryName = text('category')
  const categoryId = categoryName ? await ensureCategoryByName(categoryName) : undefined
  return {
    ...(text('sections') ? { sections: parsePlacementLabels(text('sections')!, (value) => resolveSectionLabel(catalogue, value)).values } : {}),
    ...(text('subsections') ? { subsections: parsePlacementLabels(text('subsections')!, (value) => resolveSubsectionLabel(catalogue, value)).values } : {}),
    ...(text('flowRole') ? { flowRole: matchLabelValue(FLOW_ROLES, text('flowRole')) } : {}),
    ...(text('settlementChannel') ? { settlementChannel: matchLabelValue(SETTLEMENT_CHANNELS, text('settlementChannel')) } : {}),
    ...(text('spendingTreatment') ? { spendingTreatment: matchLabelValue(SPENDING_TREATMENTS, text('spendingTreatment')) } : {}),
    ...(text('recurrence') ? { recurrence: matchLabelValue(RECURRENCES, text('recurrence')) } : {}),
    ...(categoryId ? { categoryId } : {}),
  }
}

export const listLabelRulesTool: ToolDefinition = {
  name: 'list_label_rules',
  description: 'Lists the standing labelling rules with their labels, the rationale each was saved with, and what each has been credited with: rows it filled, rows the user confirmed with its labels intact, and rows where its labels were changed before confirmation. Read this before proposing a rule — a standing rule may already cover the batch, or an overridden one may be telling you the rule was wrong. Read-only.',
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async () => {
    const rules = await labelRulesWithStats()
    return JSON.stringify(rules.map(({ rule, stats }) => ({
      ruleId: rule.id,
      name: rule.name || rule.contains,
      matches: { field: rule.field, contains: rule.contains, caseSensitive: rule.caseSensitive === true },
      labels: rule.labels,
      destinationTableId: rule.destinationTableId,
      rationale: rule.rationale,
      createdBy: rule.createdBy,
      stats,
    })))
  },
}

export const saveLabelRuleTool: ToolDefinition = {
  name: 'save_label_rule',
  description: `Saves a standing rule: rows whose text contains this string get these labels automatically when they are staged, so a decision made once is not made again on the next import. Ask the user before saving one — a rule outlives the batch it was written for. A rule fills only labels a row does not already have, so it never overwrites a judgement. Write the rationale as if explaining to someone else why this label set is safe for everything matching this string, including what you checked and what you deliberately excluded; a few lines is right. Values: sections and subsections are free text naming the app's own sections and screens (list_label_options says what exists, several separated by commas); flowRole ${labelValues(FLOW_ROLES).join(' | ')}; settlementChannel ${labelValues(SETTLEMENT_CHANNELS).join(' | ')}; spendingTreatment ${labelValues(SPENDING_TREATMENTS).join(' | ')}; recurrence ${labelValues(RECURRENCES).join(' | ')}; category is free text.`,
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name for the rules list.' },
      field: { type: 'string', description: `Field the text is looked for in. Usually description. One of: ${INGESTION_QUERY_FIELDS.join(', ')}.` },
      contains: { type: 'string' },
      caseSensitive: { type: 'boolean' },
      rationale: { type: 'string', description: 'Why this label set is right for everything matching this string.' },
      sections: { type: 'string', description: 'Section names or ids, comma-separated.' },
      subsections: { type: 'string', description: 'Screen names or ids, comma-separated.' },
      flowRole: { type: 'string', enum: labelValues(FLOW_ROLES) },
      settlementChannel: { type: 'string', enum: labelValues(SETTLEMENT_CHANNELS) },
      spendingTreatment: { type: 'string', enum: labelValues(SPENDING_TREATMENTS) },
      recurrence: { type: 'string', enum: labelValues(RECURRENCES) },
      category: { type: 'string' },
      destinationTableId: { type: 'number' },
      applyNow: { type: 'boolean', description: 'Also run it over the rows already waiting. Default true.' },
    },
    required: ['contains', 'rationale'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.contains !== 'string' || !args.contains.trim()) return 'Error: contains is required.'
    if (typeof args.rationale !== 'string' || !args.rationale.trim()) return 'Error: a rationale is required — a rule nobody can justify later is a rule nobody can keep.'
    const labels = await labelsFromArgs(args, context.translate)
    if (Object.keys(labels).length === 0 && typeof args.destinationTableId !== 'number') return 'Error: a rule must set at least one label or a destination table.'
    const rule: LabelRule = {
      name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : undefined,
      field: typeof args.field === 'string' && args.field ? args.field : 'description',
      contains: args.contains.trim(),
      caseSensitive: args.caseSensitive === true,
      labels,
      destinationTableId: typeof args.destinationTableId === 'number' ? args.destinationTableId : undefined,
      rationale: args.rationale.trim(),
      createdBy: 'assistant',
      createdAt: Date.now(),
    }
    const ruleId = await saveLabelRule(rule)
    const applied = args.applyNow === false ? null : await applyLabelRulesToRows()
    return JSON.stringify({ ruleId, saved: rule, applied })
  },
}

export const applyLabelRulesTool: ToolDefinition = {
  name: 'apply_label_rules',
  description: 'Runs every standing rule over the rows still waiting, filling labels they do not already have and reporting what each rule filled and how many rows became ready. Rules run by themselves when rows are staged; this is for after a rule is added or edited, or to catch rows that predate it.',
  parameters: { type: 'object', properties: { rowIds: { type: 'array', items: { type: 'number' }, description: 'Limit the run to these rows. Omit for every waiting row.' } }, additionalProperties: false },
  execute: async (args) => {
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : undefined
    return JSON.stringify(await applyLabelRulesToRows(rowIds))
  },
}

export const deleteLabelRuleTool: ToolDefinition = {
  name: 'delete_label_rule',
  description: 'Removes a standing rule. Rows it already labelled keep their labels — only the standing decision goes, so future imports stop being labelled by it. Ask the user for confirmation first: a rule is a decision they own.',
  parameters: { type: 'object', properties: { ruleId: { type: 'number' }, confirmed: { type: 'boolean' } }, required: ['ruleId'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.ruleId !== 'number') return 'Error: ruleId is required.'
    if (args.confirmed !== true) return 'Error: confirmation is required. Ask the user before deleting a rule, then call again with confirmed: true.'
    await deleteLabelRule(args.ruleId)
    return JSON.stringify({ deleted: args.ruleId })
  },
}
