import type { ToolDefinition } from './types'

/**
 * How much of a file comes back at once.
 *
 * A 2MB note read whole is half a million tokens in a single round, and every round of
 * that message carries it again. A generous slice answers almost every question, and the
 * rest can be asked for by offset — which costs a round, but only when it is needed.
 */
const MAX_CHARACTERS = 20_000

export const readTextFileTool: ToolDefinition = {
  name: 'read_text_file',
  description: "Reads an attached .txt or .md file by its fileId. Long files come back truncated, with the total said, so ask for what you need rather than the whole of something large.",
  parameters: {
    type: 'object',
    properties: {
      fileId: { type: 'string', description: 'The id of the attached file to read.' },
      offset: { type: 'number', description: 'Where to start, in characters. For reading on past what a first call returned.' },
    },
    required: ['fileId'],
    additionalProperties: false,
  },
  execute: async (args, context) => {
    const fileId = typeof args.fileId === 'string' ? args.fileId : undefined
    if (!fileId) return 'Error: fileId argument missing or not a string.'

    const attachment = context.attachments.find((a) => a.id === fileId)
    if (!attachment) return `Error: no attached file with id "${fileId}".`

    const offset = typeof args.offset === 'number' && args.offset > 0 ? Math.trunc(args.offset) : 0
    const slice = attachment.content.slice(offset, offset + MAX_CHARACTERS)
    const end = offset + slice.length
    if (offset === 0 && end === attachment.content.length) return slice

    return [
      `"${attachment.name}": characters ${offset}-${end} of ${attachment.content.length}.`,
      end < attachment.content.length ? `Call again with offset: ${end} for what follows.` : 'This is the end of the file.',
      '',
      slice,
    ].join('\n')
  },
}
