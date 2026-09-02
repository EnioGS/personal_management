import { describe, expect, it } from 'vitest'
import { findTool, toolRegistry, toolsForRequest } from './registry'

describe('findTool', () => {
  it('finds a registered tool by name', () => {
    expect(findTool('read_text_file')).toBe(toolRegistry[0])
  })

  it('returns undefined for an unknown name', () => {
    expect(findTool('does_not_exist')).toBeUndefined()
  })

  it('registers read, ingestion-classification, and append-only table-writing tools', () => {
    expect(toolRegistry.map((t) => t.name)).toEqual([
      'read_text_file',
      'read_csv',
      'read_table',
      'read_ingestion_guide',
      'list_ingestion_datasets',
      'read_ingestion_table',
      'read_ingestion_provenance',
      'assign_ingestion_columns',
      'add_ingestion_blank_column',
      'suggest_ingestion_labels',
      'update_ingestion_labels',
      'label_ingestion_rows_by_match',
      'update_ingestion_data_fields',
      'validate_ingestion_rows',
      'write_to_table',
    ])
  })

  it('leaves both data-moving steps to the user and keeps no category-rule tools', () => {
    expect(findTool('stage_ingestion_source')).toBeUndefined()
    expect(findTool('promote_ingestion_rows')).toBeUndefined()
    expect(findTool('add_category')).toBeUndefined()
    expect(findTool('update_category_rule')).toBeUndefined()
    expect(findTool('delete_category_rule')).toBeUndefined()
    expect(findTool('read_category_raw_values')).toBeUndefined()
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
