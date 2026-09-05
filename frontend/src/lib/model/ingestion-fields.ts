import { sourceFilenameOf } from './observations'
import { SOURCE_FILENAME_COLUMN } from './source-files'
import type { ConfirmedRow, SourceRow } from './types'

/**
 * One flat name for anything a question can be asked about a row, so a rule or a filter
 * reads like the column it means rather than like the shape it is stored in.
 *
 * A source row's own columns are addressed by their real names — that is the point of
 * keeping the file's columns intact — with the four labels alongside them.
 */
export const QUERY_FIELDS = ['source_filename', 'sections', 'screens', 'class', 'category', 'subcategory'] as const

export function resolveSourceField(row: SourceRow, field: string): unknown {
  switch (field) {
    case 'sections': return (row.labels.sections ?? []).join(', ')
    case 'screens': return (row.labels.screens ?? []).join(', ')
    case 'category': return row.labels.category ?? ''
    case 'class': return row.labels.class ?? ''
    case 'subcategory': return row.labels.subcategory ?? ''
    case 'source': case SOURCE_FILENAME_COLUMN: return row.values[SOURCE_FILENAME_COLUMN] ?? ''
    case 'marked_for_elimination': return row.markedForElimination ? 'yes' : 'no'
    // Anything else is one of the file's own columns, under the name the file gave it.
    default: return row.values[field]
  }
}

export function resolveConfirmedField(row: ConfirmedRow, field: string): unknown {
  switch (field) {
    case 'sections': case 'section': return row.section
    case 'screens': case 'screen': return row.screen
    case 'source': case SOURCE_FILENAME_COLUMN: return sourceFilenameOf(row.observations)
    case 'marked_for_elimination': return row.markedForElimination ? 'yes' : 'no'
    default: return (row as unknown as Record<string, unknown>)[field]
  }
}
