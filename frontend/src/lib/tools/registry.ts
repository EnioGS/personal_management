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
// Finance tables are read-only to the assistant. Every write — adding a row,
// correcting one, taking one out — happens in the ingestion centre, where the row
// keeps its raw values, its labels are explicit, and the moves that matter are the
// user's own clicks. Writing straight to a table would be a second door into the
// dashboards with none of that.
//
// Promoting labelled rows and reallocating confirmed ones stay user-only. Staging is
// reachable, but only behind an explicit confirmation the user has given (see the
// tool's own description).

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
