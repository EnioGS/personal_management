import Papa from 'papaparse'
import type { ToolDefinition } from './types'

const DEFAULT_ROW_COUNT = 10

export const readCsvTool: ToolDefinition = {
  name: 'read_csv',
  description:
    'Reads a previously attached .csv file, given its fileId. Returns the column headers, ' +
    'total row count, and a slice of rows (head, tail, or full) as CSV text. Use mode "head" ' +
    'or "tail" with a small rowCount to inspect a large file before deciding what to do with it.',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'The id of the attached CSV file to read.' },
      mode: {
        type: 'string',
        enum: ['head', 'tail', 'full'],
        description: 'Which rows to return. Defaults to "head". "full" ignores rowCount.',
      },
      rowCount: {
        type: 'number',
        description: 'Number of rows to return for "head"/"tail". Defaults to 10. Ignored for "full".',
      },
    },
    required: ['fileId'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const fileId = typeof args.fileId === 'string' ? args.fileId : undefined
    if (!fileId) return 'Error: fileId argument missing or not a string.'

    const attachment = context.attachments.find((a) => a.id === fileId)
    if (!attachment) return `Error: no attached file with id "${fileId}".`

    if (attachment.type !== 'text/csv') {
      return `Error: "${attachment.name}" is not a CSV file (read_text_file may be more appropriate).`
    }

    const mode = args.mode === 'tail' || args.mode === 'full' ? args.mode : 'head'
    const rowCount =
      typeof args.rowCount === 'number' && Number.isFinite(args.rowCount) && args.rowCount > 0
        ? Math.floor(args.rowCount)
        : DEFAULT_ROW_COUNT

    const parsed = Papa.parse<Record<string, string>>(attachment.content, { header: true, skipEmptyLines: true })
    if (parsed.errors.length > 0) {
      return `Error: could not parse "${attachment.name}" as CSV: ${parsed.errors[0].message}`
    }

    const fields = parsed.meta.fields ?? []
    const totalRows = parsed.data.length
    const slice =
      mode === 'full' ? parsed.data : mode === 'tail' ? parsed.data.slice(-rowCount) : parsed.data.slice(0, rowCount)

    const sliceCsv = Papa.unparse({ fields, data: slice })
    const sliceLabel = mode === 'full' ? `all ${totalRows} rows` : `${mode} ${slice.length} of ${totalRows} rows`

    return `File "${attachment.name}": ${totalRows} row(s), columns: ${fields.join(', ')}.\nShowing ${sliceLabel}:\n${sliceCsv}`
  },
}
