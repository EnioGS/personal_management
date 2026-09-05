import { loadLabelCatalogue } from '@/lib/label-catalogue-source'
import { parsePlacementLabels, resolveAccountLabel, resolveCardLabel, resolveScreenLabel, resolveSectionLabel, withDerivedSections } from '@/lib/model/label-catalogue'
import { applyLabelRulesToRows, deleteLabelRule, labelRulesWithStats, listLabelRules, saveLabelRule, updateLabelRule } from '@/lib/model/label-rules-repository'
import type { IngestionRowLabels, LabelRule, RuleContext } from '@/lib/model/types'
import type { ToolDefinition } from './types'

const MATCH_MODES = ['contains', 'equals', 'startsWith', 'regex'] as const

function conditionsFrom(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const conditions = (value as Record<string, unknown>[])
    .filter((condition) => typeof condition.field === 'string' && typeof condition.contains === 'string' && condition.contains.trim())
    .map((condition) => ({
      field: String(condition.field),
      contains: String(condition.contains).trim(),
      match: MATCH_MODES.includes(condition.match as never) ? (condition.match as LabelRule['match']) : undefined,
      caseSensitive: condition.caseSensitive === true,
    }))
  return conditions.length > 0 ? conditions : undefined
}

/** A pattern that cannot compile is refused where the user can see why, not at match time. */
function invalidRegex(rule: LabelRule): string | null {
  for (const condition of [rule, ...(rule.where ?? [])]) {
    if (condition.match !== 'regex') continue
    try { new RegExp(condition.contains) } catch (error) {
      return `"${condition.contains}" is not a usable regular expression: ${error instanceof Error ? error.message : 'it could not be compiled'}.`
    }
  }
  return null
}

export const listLabelRulesTool: ToolDefinition = {
  name: 'list_label_rules',
  description: "Lists the standing rules with their conditions, the labels they set, the rationale each carries and what each has been credited with. Rules belong to one of two stages and never cross: 'source' runs as a file arrives, 'confirmed' fills in what a row already in a table says about itself. Read this before writing another \u2014 one may already cover the case, and a rule with overridden rows is telling you it was wrong.",
  parameters: { type: 'object', properties: { context: { type: 'string', enum: ['source', 'confirmed'] } }, additionalProperties: false },
  execute: async (args) => {
    const rules = await labelRulesWithStats(args.context as RuleContext | undefined)
    return JSON.stringify(rules.map(({ rule, stats }) => ({
      ruleId: rule.id,
      name: rule.name || rule.contains,
      context: rule.context,
      matches: { field: rule.field, contains: rule.contains, match: rule.match ?? 'contains', and: rule.where ?? [] },
      labels: rule.labels,
      rationale: rule.rationale,
      createdBy: rule.createdBy,
      stats,
    })))
  },
}

export const saveLabelRuleTool: ToolDefinition = {
  name: 'save_label_rule',
  description: "Saves a standing rule and applies it. No permission needed: a rule fills only what a row does not already say, and the user can read, edit or delete any of them. Choose the stage \u2014 'source' labels rows as a file arrives, 'confirmed' fills category, subcategory, account and card on rows already in a table. Match by substring, or equals, startsWith or regex; a short name needs one of the latter, since 'of' is inside Microsoft. Conditions stack, all of which must hold, which is how a rule is narrowed to one file through source_filename. The rationale is required: why these labels are right for everything matching this.",
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      context: { type: 'string', enum: ['source', 'confirmed'] },
      field: { type: 'string', description: 'Which field the text is looked for in. A source rule can name any of the file\'s own columns.' },
      contains: { type: 'string' },
      match: { type: 'string', enum: [...MATCH_MODES] },
      caseSensitive: { type: 'boolean' },
      where: {
        type: 'array',
        description: 'Further conditions, all of which must hold.',
        items: {
          type: 'object',
          properties: { field: { type: 'string' }, contains: { type: 'string' }, match: { type: 'string', enum: [...MATCH_MODES] }, caseSensitive: { type: 'boolean' } },
          required: ['field', 'contains'],
        },
      },
      rationale: { type: 'string' },
      sections: { type: 'string', description: 'Section names or ids, comma-separated.' },
      screens: { type: 'string', description: 'Screen names or ids, comma-separated.' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      account: { type: 'string', description: "One of the user's accounts, by name — how a rule says which account a file's rows moved through." },
      card: { type: 'string', description: "One of the user's credit cards, by name." },
      applyNow: { type: 'boolean', description: 'Also run it over the rows already waiting. Default true.' },
    },
    required: ['contains', 'rationale', 'context'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.contains !== 'string' || !args.contains.trim()) return 'Error: contains is required.'
    if (typeof args.rationale !== 'string' || !args.rationale.trim()) return 'Error: a rationale is required — a rule nobody can justify later is a rule nobody can keep.'
    const stage: RuleContext = args.context === 'confirmed' ? 'confirmed' : 'source'

    const catalogue = await loadLabelCatalogue(context.translate)
    const text = (field: string) => (typeof args[field] === 'string' ? (args[field] as string) : undefined)
    const sections = text('sections') ? parsePlacementLabels(text('sections')!, (value) => resolveSectionLabel(catalogue, value)) : undefined
    const screens = text('screens') ? parsePlacementLabels(text('screens')!, (value) => resolveScreenLabel(catalogue, value, sections?.values)) : undefined
    const account = text('account') ? resolveAccountLabel(catalogue, text('account')!) : undefined
    const card = text('card') ? resolveCardLabel(catalogue, text('card')!) : undefined
    const unknown = [
      ...(sections?.unknown ?? []),
      ...(screens?.unknown ?? []),
      ...(text('account') && !account ? [text('account')!] : []),
      ...(text('card') && !card ? [text('card')!] : []),
    ]
    if (unknown.length > 0) return `Error: nothing is called ${unknown.join(', ')}. Call list_label_options for what exists.`

    const labels: IngestionRowLabels = withDerivedSections({
      ...(sections?.values.length ? { sections: sections.values } : {}),
      ...(screens?.values.length ? { screens: screens.values } : {}),
      ...(text('category') ? { category: text('category') } : {}),
      ...(text('subcategory') ? { subcategory: text('subcategory') } : {}),
      ...(account ? { account } : {}),
      ...(card ? { card } : {}),
    }, catalogue)
    if (Object.keys(labels).length === 0) return 'Error: a rule must set at least one label.'

    const rule: LabelRule = {
      name: typeof args.name === 'string' && args.name.trim() ? args.name.trim() : undefined,
      context: stage,
      field: typeof args.field === 'string' && args.field ? args.field : 'description',
      contains: args.contains.trim(),
      match: MATCH_MODES.includes(args.match as never) ? (args.match as LabelRule['match']) : undefined,
      caseSensitive: args.caseSensitive === true,
      where: conditionsFrom(args.where),
      labels,
      rationale: args.rationale.trim(),
      createdBy: 'assistant',
      createdAt: Date.now(),
    }
    const bad = invalidRegex(rule)
    if (bad) return `Error: ${bad}`

    const ruleId = await saveLabelRule(rule)
    const applied = args.applyNow === false ? null : await applyLabelRulesToRows(stage, context.translate)
    return JSON.stringify({ ruleId, saved: rule, applied })
  },
}

export const editLabelRuleTool: ToolDefinition = {
  name: 'edit_label_rule',
  description: "Rewrites a standing rule \u2014 the text it looks for, where it looks, how it matches, the labels it concludes, the rationale. Use it rather than deleting and rewriting: the rule keeps its place, and what it already labelled stays labelled. Pass only what changes. Rewriting a rule the user wrote is theirs to ask for; keeping your own accurate is yours. It is applied afterwards unless you say otherwise.",
  parameters: {
    type: 'object',
    properties: {
      ruleId: { type: 'number' },
      name: { type: 'string' },
      field: { type: 'string' },
      contains: { type: 'string' },
      match: { type: 'string', enum: [...MATCH_MODES] },
      caseSensitive: { type: 'boolean' },
      sections: { type: 'string' },
      screens: { type: 'string' },
      category: { type: 'string' },
      subcategory: { type: 'string' },
      account: { type: 'string' },
      card: { type: 'string' },
      rationale: { type: 'string' },
      applyNow: { type: 'boolean' },
    },
    required: ['ruleId'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    if (typeof args.ruleId !== 'number') return 'Error: ruleId is required.'
    const existing = (await listLabelRules()).find((rule) => rule.id === args.ruleId)
    if (!existing) return `Error: no rule has id ${args.ruleId}. Call list_label_rules for the ones that do.`

    const catalogue = await loadLabelCatalogue(context.translate)
    const text = (field: string) => (typeof args[field] === 'string' ? (args[field] as string) : undefined)
    const sections = text('sections') === undefined ? undefined : parsePlacementLabels(text('sections')!, (value) => resolveSectionLabel(catalogue, value))
    const screens = text('screens') === undefined
      ? undefined
      : parsePlacementLabels(text('screens')!, (value) => resolveScreenLabel(catalogue, value, sections?.values ?? existing.labels.sections))
    const account = text('account') ? resolveAccountLabel(catalogue, text('account')!) : undefined
    const card = text('card') ? resolveCardLabel(catalogue, text('card')!) : undefined
    const unknown = [
      ...(sections?.unknown ?? []),
      ...(screens?.unknown ?? []),
      ...(text('account') && !account ? [text('account')!] : []),
      ...(text('card') && !card ? [text('card')!] : []),
    ]
    if (unknown.length > 0) return `Error: nothing is called ${unknown.join(', ')}. Call list_label_options for what exists.`

    // Everything not mentioned is the rule as it was: an edit says what changes.
    const labels: IngestionRowLabels = withDerivedSections({
      ...existing.labels,
      ...(sections ? { sections: sections.values } : {}),
      ...(screens ? { screens: screens.values } : {}),
      ...(text('category') ? { category: text('category') } : {}),
      ...(text('subcategory') ? { subcategory: text('subcategory') } : {}),
      ...(account ? { account } : {}),
      ...(card ? { card } : {}),
    }, catalogue)

    const rewritten: LabelRule = {
      ...existing,
      name: text('name')?.trim() || existing.name,
      field: text('field')?.trim() || existing.field,
      contains: text('contains')?.trim() || existing.contains,
      match: MATCH_MODES.includes(args.match as never) ? (args.match as LabelRule['match']) : existing.match,
      caseSensitive: typeof args.caseSensitive === 'boolean' ? args.caseSensitive : existing.caseSensitive,
      labels,
      rationale: text('rationale')?.trim() || existing.rationale,
    }
    const bad = invalidRegex(rewritten)
    if (bad) return `Error: ${bad}`

    await updateLabelRule(args.ruleId, rewritten, 'assistant')
    const applied = args.applyNow === false ? null : await applyLabelRulesToRows(existing.context, context.translate)
    // Read back rather than echoed: the stamp saying who rewrote it is put on by the
    // store, and reporting the version that was sent would leave that out.
    const stored = (await listLabelRules()).find((rule) => rule.id === args.ruleId)
    return JSON.stringify({ ruleId: args.ruleId, rule: stored, applied })
  },
}

export const applyLabelRulesTool: ToolDefinition = {
  name: 'apply_label_rules',
  description: "Runs one stage's standing rules over the rows it holds, filling only what those rows do not already say. Run it freely: it needs no permission, cannot overwrite a decision and cannot confirm anything. Source rules also run by themselves as a file arrives; this is for after a rule is added or edited.",
  parameters: { type: 'object', properties: { context: { type: 'string', enum: ['source', 'confirmed'] }, rowIds: { type: 'array', items: { type: 'number' } } }, required: ['context'], additionalProperties: false },
  execute: async (args, context) => {
    const stage: RuleContext = args.context === 'confirmed' ? 'confirmed' : 'source'
    const rowIds = Array.isArray(args.rowIds) ? args.rowIds.filter((id): id is number => typeof id === 'number') : undefined
    return JSON.stringify(await applyLabelRulesToRows(stage, context.translate, rowIds))
  },
}

export const deleteLabelRuleTool: ToolDefinition = {
  name: 'delete_label_rule',
  description: "Removes a standing rule. Rows it already labelled keep their labels. Ask the user first: creating a rule is undone in a click, removing one they wrote is not.",
  parameters: { type: 'object', properties: { ruleId: { type: 'number' }, confirmed: { type: 'boolean' } }, required: ['ruleId'], additionalProperties: false },
  execute: async (args) => {
    if (typeof args.ruleId !== 'number') return 'Error: ruleId is required.'
    if (args.confirmed !== true) return 'Error: confirmation is required. Ask the user before deleting a rule, then call again with confirmed: true.'
    await deleteLabelRule(args.ruleId)
    return JSON.stringify({ deleted: args.ruleId })
  },
}
