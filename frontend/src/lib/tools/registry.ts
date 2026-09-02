import type { OpenRouterTool } from '@/lib/openrouter'
import { addCategoryTool } from './add-category'
import { deleteCategoryRuleTool } from './delete-category-rule'
import { readCsvTool } from './read-csv'
import { readCategoryRawValuesTool } from './read-category-raw-values'
import { readTableTool } from './read-table'
import { readTextFileTool } from './read-text-file'
import type { ToolDefinition } from './types'
import { updateCategoryRuleTool } from './update-category-rule'
import { writeToTableTool } from './write-to-table'
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
  readCategoryRawValuesTool,
  addCategoryTool,
  updateCategoryRuleTool,
  deleteCategoryRuleTool,
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
