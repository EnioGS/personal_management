import type { OpenRouterTool } from '@/lib/openrouter'
import {
  assignIngestionColumnsTool,
  addIngestionBlankColumnTool,
  discardIngestionRowsTool,
  findIngestionDuplicatesTool,
  labelIngestionRowsByMatchTool,
  listIngestionDatasetsTool,
  readIngestionGuideTool,
  readIngestionProvenanceTool,
  readIngestionTableTool,
  suggestIngestionLabelsTool,
  updateIngestionLabelsTool,
  updateIngestionDataFieldsTool,
  validateIngestionRowsTool,
} from './ingestion-tools'
import { readCsvTool } from './read-csv'
import { readTableTool } from './read-table'
import { readTextFileTool } from './read-text-file'
import type { ToolDefinition } from './types'
import { writeToTableTool } from './write-to-table'
// Staging a mapped source and promoting labelled rows are user-only actions: both
// are the moments data changes shape, so no tool implements them at all.
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
  assignIngestionColumnsTool,
  addIngestionBlankColumnTool,
  findIngestionDuplicatesTool,
  discardIngestionRowsTool,
  suggestIngestionLabelsTool,
  updateIngestionLabelsTool,
  labelIngestionRowsByMatchTool,
  updateIngestionDataFieldsTool,
  validateIngestionRowsTool,
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
