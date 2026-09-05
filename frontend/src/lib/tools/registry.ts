import type { OpenRouterTool } from '@/lib/openrouter'
import { applyLabelRulesTool, deleteLabelRuleTool, listLabelRulesTool, saveLabelRuleTool } from './label-rule-tools'
import { readCsvTool } from './read-csv'
import { readIngestionGuideTool } from './guide-tool'
import { setConversationTitleTool } from './conversation-tools'
import { addClassificationNoteTool, deleteClassificationNoteTool, listClassificationNotesTool } from './note-tools'
import { readTextFileTool } from './read-text-file'
import { addAccountTool, addCardTool, listAccountsAndCardsTool } from './settings-tools'
import type { ToolDefinition } from './types'
import {
  addConfirmedRowTool,
  addSourceRowTool,
  assignSourceColumnsTool,
  confirmRowsTool,
  dropSourceTableTool,
  importAsSourceFileTool,
  labelRowsByMatchTool,
  listLabelOptionsTool,
  markRowsTool,
  newRowIdTool,
  placeConfirmedRowsTool,
  queryVaultTool,
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
  placeConfirmedRowsTool,
  markRowsTool,
  newRowIdTool,
  addConfirmedRowTool,
  confirmRowsTool,
  dropSourceTableTool,
  listLabelRulesTool,
  saveLabelRuleTool,
  applyLabelRulesTool,
  deleteLabelRuleTool,
  listClassificationNotesTool,
  addClassificationNoteTool,
  deleteClassificationNoteTool,
  setConversationTitleTool,
]

export function findTool(name: string): ToolDefinition | undefined {
  return toolRegistry.find((tool) => tool.name === name)
}

export function toolsForRequest(): OpenRouterTool[] {
  return toolRegistry.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
}
