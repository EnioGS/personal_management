import type { OpenRouterTool } from '@/lib/openrouter'
import {
  assignIngestionColumnsTool,
  addIngestionBlankColumnTool,
  discardIngestionRowsTool,
  countIngestionRowsTool,
  findIngestionDuplicatesTool,
  groupIngestionRowsTool,
  labelIngestionRowsByMatchTool,
  listIngestionDatasetsTool,
  markSourceRowsTool,
  readIngestionGuideTool,
  readIngestionProvenanceTool,
  readIngestionTableTool,
  queryIngestionRowsTool,
  stageIngestionSourceTool,
  suggestIngestionLabelsTool,
  updateIngestionLabelsTool,
  updateIngestionDataFieldsTool,
  validateIngestionRowsTool,
} from './ingestion-tools'
import { applyLabelRulesTool, deleteLabelRuleTool, listLabelRulesTool, saveLabelRuleTool } from './label-rule-tools'
import { readCsvTool } from './read-csv'
import { readTableTool } from './read-table'
import { readTextFileTool } from './read-text-file'
import type { ToolDefinition } from './types'
import { writeToTableTool } from './write-to-table'
// Promoting labelled rows and reallocating confirmed ones stay user-only. Staging is
// reachable, but only behind an explicit confirmation the user has given (see the
// tool's own description).
// Row correction/deletion tools stay disabled: the assistant may append new rows,
// but cannot alter existing history. Their implementations remain available here for
// a future, separately-authorized capability.
// import { deleteTableRowsTool } from './delete-table-rows'
// import { restoreTableRowsTool } from './restore-table-rows'
// import { updateTableRowsTool } from './update-table-rows'

/** Adding a tool = write one ToolDefinition file + add it here. Nothing else changes. */
export const toolRegistry: ToolDefinition[] = [
  readTextFileTool,
  readCsvTool,
  readTableTool,
  readIngestionGuideTool,
  listIngestionDatasetsTool,
  readIngestionTableTool,
  readIngestionProvenanceTool,
  countIngestionRowsTool,
  queryIngestionRowsTool,
  groupIngestionRowsTool,
  assignIngestionColumnsTool,
  addIngestionBlankColumnTool,
  markSourceRowsTool,
  stageIngestionSourceTool,
  findIngestionDuplicatesTool,
  discardIngestionRowsTool,
  suggestIngestionLabelsTool,
  updateIngestionLabelsTool,
  labelIngestionRowsByMatchTool,
  updateIngestionDataFieldsTool,
  validateIngestionRowsTool,
  listLabelRulesTool,
  saveLabelRuleTool,
  applyLabelRulesTool,
  deleteLabelRuleTool,
  writeToTableTool,
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
