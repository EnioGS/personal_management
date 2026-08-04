import type { OpenRouterTool } from '@/lib/openrouter'
import { deleteTableRowsTool } from './delete-table-rows'
import { readCsvTool } from './read-csv'
import { readTableTool } from './read-table'
import { readTextFileTool } from './read-text-file'
import { restoreTableRowsTool } from './restore-table-rows'
import type { ToolDefinition } from './types'
import { updateTableRowsTool } from './update-table-rows'
import { writeToTableTool } from './write-to-table'

/** Adding a tool = write one ToolDefinition file + add it here. Nothing else changes. */
export const toolRegistry: ToolDefinition[] = [
  readTextFileTool,
  readCsvTool,
  writeToTableTool,
  readTableTool,
  updateTableRowsTool,
  deleteTableRowsTool,
  restoreTableRowsTool,
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
