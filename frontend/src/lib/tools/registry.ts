import type { OpenRouterTool } from '@/lib/openrouter'
import { applyLabelRulesTool, deleteLabelRuleTool, listLabelRulesTool, saveLabelRuleTool } from './label-rule-tools'
import { readCsvTool } from './read-csv'
import { readIngestionGuideTool } from './guide-tool'
import { readTextFileTool } from './read-text-file'
import type { ToolDefinition } from './types'
import {
  addConfirmedRowTool,
  assignSourceColumnsTool,
  confirmRowsTool,
  dropSourceTableTool,
  importAsSourceFileTool,
  labelRowsByMatchTool,
  listLabelOptionsTool,
  markRowsTool,
  newRowIdTool,
  queryVaultTool,
  setConfirmedMeaningTool,
  setLabelsTool,
  setSignConventionTool,
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
  queryVaultTool,
  importAsSourceFileTool,
  assignSourceColumnsTool,
  setSignConventionTool,
  setLabelsTool,
  labelRowsByMatchTool,
  setConfirmedMeaningTool,
  markRowsTool,
  newRowIdTool,
  addConfirmedRowTool,
  confirmRowsTool,
  dropSourceTableTool,
  listLabelRulesTool,
  saveLabelRuleTool,
  applyLabelRulesTool,
  deleteLabelRuleTool,
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
