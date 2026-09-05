import type { OpenRouterTool } from '@/lib/openrouter'
import { applyLabelRulesTool, deleteLabelRuleTool, editLabelRuleTool, listLabelRulesTool, saveLabelRuleTool } from './label-rule-tools'
import { readCsvTool } from './read-csv'
import { readIngestionGuideTool } from './guide-tool'
import { setConversationTitleTool } from './conversation-tools'
import { addClassificationNoteTool, deleteClassificationNoteTool, editClassificationNoteTool, listClassificationNotesTool } from './note-tools'
import { readTextFileTool } from './read-text-file'
import { addAccountTool, addCardTool, listAccountsAndCardsTool } from './settings-tools'
import type { ToolDefinition } from './types'
import {
  addConfirmedRowTool,
  addSourceRowTool,
  assignSourceColumnsTool,
  confirmRowsTool,
  dropSourceTableTool,
  fillFromObservationsTool,
  importAsSourceFileTool,
  labelRowsByMatchTool,
  listLabelOptionsTool,
  markRowsTool,
  newRowIdTool,
  placeConfirmedRowsTool,
  queryVaultTool,
  reviseConfirmedRowsTool,
  setConfirmedMeaningTool,
  setLabelsTool,
  setSignConventionTool,
  setSourceValuesTool,
} from './vault-tools'

// Reading is SQL; writing is a small set of functions that validate. Deleting rows is
// the user's alone — the assistant marks, and a marked row is invisible to every
// dashboard while staying in its table, which is what makes that division safe.

/** Adding a tool = write one ToolDefinition file + add it here. Nothing else changes. */
export const toolRegistry: ToolDefinition[] = [
  readTextFileTool,
  readCsvTool,
  readIngestionGuideTool,
  listLabelOptionsTool,
  listAccountsAndCardsTool,
  addAccountTool,
  addCardTool,
  queryVaultTool,
  importAsSourceFileTool,
  assignSourceColumnsTool,
  setSignConventionTool,
  setLabelsTool,
  labelRowsByMatchTool,
  addSourceRowTool,
  setSourceValuesTool,
  setConfirmedMeaningTool,
  reviseConfirmedRowsTool,
  placeConfirmedRowsTool,
  fillFromObservationsTool,
  markRowsTool,
  newRowIdTool,
  addConfirmedRowTool,
  confirmRowsTool,
  dropSourceTableTool,
  listLabelRulesTool,
  saveLabelRuleTool,
  editLabelRuleTool,
  applyLabelRulesTool,
  deleteLabelRuleTool,
  listClassificationNotesTool,
  addClassificationNoteTool,
  editClassificationNoteTool,
  deleteClassificationNoteTool,
  setConversationTitleTool,
]

export function findTool(name: string): ToolDefinition | undefined {
  return name === openToolsetTool.name ? openToolsetTool : toolRegistry.find((tool) => tool.name === name)
}

/**
 * The tools grouped by the work they belong to.
 *
 * Every schema in a request is paid for on every round of every message, and most
 * conversations use a handful. So a request carries the core — reading, asking questions,
 * and the guide — plus whichever groups this conversation has opened, and `open_toolset`
 * opens one when the work turns out to need it. The cost of asking is a single round,
 * once per conversation; the cost of not asking was several thousand tokens on every
 * request, including the ones where nobody touched the data.
 */
export const TOOL_GROUPS: Record<string, { summary: string; tools: string[] }> = {
  ingesting: {
    summary: 'Working on an uploaded file: assigning its columns, making its signs agree, labelling its rows, adding or correcting one, and confirming them into their tables.',
    tools: [
      'import_as_source_file', 'assign_source_columns', 'set_sign_convention', 'set_labels',
      'label_rows_by_match', 'add_source_row', 'set_source_values', 'confirm_rows', 'drop_source_table',
    ],
  },
  confirmed: {
    summary: 'Changing rows already in their tables: correcting them, moving them between tables, filling in what an import left empty, marking them for elimination.',
    tools: [
      'set_confirmed_meaning', 'revise_confirmed_rows', 'place_confirmed_rows',
      'fill_from_observations', 'add_confirmed_row', 'new_row_id', 'mark_rows',
    ],
  },
  rules: {
    summary: 'Standing rules that label rows automatically, and the notes written about this data that a rule cannot express.',
    tools: [
      'list_label_rules', 'save_label_rule', 'edit_label_rule', 'apply_label_rules', 'delete_label_rule',
      'list_classification_notes', 'add_classification_note', 'edit_classification_note', 'delete_classification_note',
    ],
  },
  settings: {
    summary: "The accounts and credit cards a row can be labelled with, and registering one that does not exist yet.",
    tools: ['list_accounts_and_cards', 'add_account', 'add_card'],
  },
  conversation: {
    summary: 'This conversation itself — renaming it.',
    tools: ['set_conversation_title'],
  },
}

/** Always present: reading, asking questions of the data, and finding out how any of it works. */
const CORE_TOOLS = ['read_text_file', 'read_csv', 'query_vault', 'read_ingestion_guide', 'list_label_options']

export const openToolsetTool: ToolDefinition = {
  name: 'open_toolset',
  description: `Opens a set of tools for the rest of this conversation. Only the reading tools are here to begin with, because a request carries every tool it offers, every time. Open what the work needs, in one call if it needs several:\n${
    Object.entries(TOOL_GROUPS).map(([name, group]) => `- ${name}: ${group.summary}`).join('\n')
  }`,
  parameters: {
    type: 'object',
    properties: {
      groups: { type: 'array', items: { type: 'string', enum: Object.keys(TOOL_GROUPS) }, description: 'The sets to open.' },
    },
    required: ['groups'],
    additionalProperties: false,
  },
  execute: async (args) => {
    const asked = Array.isArray(args.groups) ? args.groups.map(String) : []
    const known = asked.filter((group) => group in TOOL_GROUPS)
    const unknown = asked.filter((group) => !(group in TOOL_GROUPS))
    if (known.length === 0) return `Error: no set is called ${unknown.join(', ') || 'that'}. The sets are ${Object.keys(TOOL_GROUPS).join(', ')}.`

    // The opening itself is done by the caller, which owns the conversation's tool list;
    // this reports what is now available so the reply can use it immediately.
    return JSON.stringify({
      opened: known,
      tools: known.flatMap((group) => TOOL_GROUPS[group].tools),
      ...(unknown.length > 0 ? { unknown } : {}),
    })
  },
}

/**
 * The tools a request carries: the core, plus whatever this conversation has opened.
 *
 * `open_toolset` is included in the result of its own group-opening call, so a model that
 * opens a set can use it from the very next round without another trip.
 */
export function toolsForRequest(openGroups: string[] = []): OpenRouterTool[] {
  const opened = new Set(openGroups.flatMap((group) => TOOL_GROUPS[group]?.tools ?? []))
  const names = new Set([...CORE_TOOLS, ...opened])

  return [openToolsetTool, ...toolRegistry.filter((tool) => names.has(tool.name))].map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
}
