import type { OpenRouterTool } from '@/lib/openrouter'
import { readCsvTool } from './read-csv'
import { readTextFileTool } from './read-text-file'
import type { ToolDefinition } from './types'
import { writeToTableTool } from './write-to-table'

/** Adding a tool = write one ToolDefinition file + add it here. Nothing else changes. */
export const toolRegistry: ToolDefinition[] = [readTextFileTool, readCsvTool, writeToTableTool]

export function findTool(name: string): ToolDefinition | undefined {
  return toolRegistry.find((tool) => tool.name === name)
}

export function toolsForRequest(): OpenRouterTool[] {
  return toolRegistry.map((tool) => ({
    type: 'function',
    function: { name: tool.name, description: tool.description, parameters: tool.parameters },
  }))
}
