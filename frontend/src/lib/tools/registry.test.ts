import { describe, expect, it } from 'vitest'
import { findTool, toolRegistry, toolsForRequest } from './registry'

describe('findTool', () => {
  it('finds a registered tool by name', () => {
    expect(findTool('read_text_file')).toBe(toolRegistry[0])
  })

  it('returns undefined for an unknown name', () => {
    expect(findTool('does_not_exist')).toBeUndefined()
  })

  it('registers read, ingestion, category-management, and append-only table-writing tools', () => {
    expect(toolRegistry.map((t) => t.name)).toEqual([
      'read_text_file',
      'read_csv',
      'read_table',
      'read_category_raw_values',
      'list_ingestion_datasets',
      'read_ingestion_table',
      'assign_ingestion_columns',
      'stage_ingestion_source',
      'update_ingestion_labels',
      'validate_ingestion_rows',
      'add_category',
      'update_category_rule',
      'delete_category_rule',
      'write_to_table',
    ])
  })

  it('exposes append-only writing but not row correction or removal', () => {
    expect(findTool('write_to_table')).toBeDefined()
    expect(findTool('update_table_rows')).toBeUndefined()
    expect(findTool('delete_table_rows')).toBeUndefined()
    expect(findTool('restore_table_rows')).toBeUndefined()
  })
})

describe('toolsForRequest', () => {
  it('maps the registry to OpenRouter function-tool shape', () => {
    const tools = toolsForRequest()
    expect(tools).toHaveLength(toolRegistry.length)
    expect(tools[0]).toEqual({
      type: 'function',
      function: {
        name: toolRegistry[0].name,
        description: toolRegistry[0].description,
        parameters: toolRegistry[0].parameters,
      },
    })
  })
})
