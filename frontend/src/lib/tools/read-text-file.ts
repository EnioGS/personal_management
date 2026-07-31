import type { ToolDefinition } from './types'

export const readTextFileTool: ToolDefinition = {
  name: 'read_text_file',
  description: 'Reads the full text content of a previously attached .txt or .md file, given its fileId.',
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'The id of the attached file to read.' },
    },
    required: ['fileId'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const fileId = typeof args.fileId === 'string' ? args.fileId : undefined
    if (!fileId) return 'Error: fileId argument missing or not a string.'

    const attachment = context.attachments.find((a) => a.id === fileId)
    if (!attachment) return `Error: no attached file with id "${fileId}".`

    return attachment.content
  },
}
