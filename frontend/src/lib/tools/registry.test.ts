import { describe, expect, it } from 'vitest'
import { findTool, toolRegistry, toolsForRequest } from './registry'

describe('findTool', () => {
  it('finds a registered tool by name', () => {
    expect(findTool('read_text_file')).toBe(toolRegistry[0])
  })

  it('returns undefined for an unknown name', () => {
    expect(findTool('does_not_exist')).toBeUndefined()
  })

  it('registers exactly the tools of the one-phase model', () => {
    expect(toolRegistry.map((tool) => tool.name)).toEqual([
      'read_text_file',
      'read_csv',
      'read_ingestion_guide',
      'list_label_options',
      'query_vault',
      'import_as_source_file',
      'assign_source_columns',
      'set_sign_convention',
      'set_labels',
      'label_rows_by_match',
      'add_source_row',
      'set_source_values',
      'set_confirmed_meaning',
      'mark_rows',
      'new_row_id',
      'add_confirmed_row',
      'confirm_rows',
      'drop_source_table',
      'list_label_rules',
      'save_label_rule',
      'apply_label_rules',
      'delete_label_rule',
    ])
  })

  it('keeps nothing from the two-phase model it replaced', () => {
    for (const gone of [
      'read_table', 'write_to_table', 'update_table_rows', 'delete_table_rows', 'restore_table_rows',
      'list_ingestion_datasets', 'stage_ingestion_source', 'promote_ingestion_rows', 'discard_ingestion_rows',
      'suggest_ingestion_labels', 'update_ingestion_labels', 'validate_ingestion_rows', 'add_category',
    ]) {
      expect(findTool(gone), gone).toBeUndefined()
    }
  })
})

describe('what the user can do and the assistant cannot', () => {
  it('is deletion, and only deletion: the assistant marks and unmarks like the user does', () => {
    expect(findTool('mark_rows')).toBeDefined()
    expect(findTool('mark_rows')!.parameters).toMatchObject({ properties: { marked: { type: 'boolean' } } })
    expect(toolRegistry.filter((tool) => /delete|remove|drop/.test(tool.name)).map((tool) => tool.name))
      .toEqual(['drop_source_table', 'delete_label_rule'])
  })

  it('guards the destructive things it can reach behind an explicit confirmation', () => {
    for (const name of ['delete_label_rule', 'confirm_rows']) {
      expect(findTool(name)!.parameters, name).toMatchObject({ properties: { confirmed: { type: 'boolean' } } })
    }
    // Dropping a source table needs no confirmation because it can only ever remove an
    // empty one — the tool refuses a file that still holds rows.
    expect(findTool('drop_source_table')!.description).toContain('has no rows left')
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
