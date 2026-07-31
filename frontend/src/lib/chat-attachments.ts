export interface ChatAttachment {
  id: string
  name: string
  type: string
  content: string
}

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_EXTENSIONS = ['.txt', '.md']

function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex === -1 ? '' : filename.slice(dotIndex).toLowerCase()
}

function mimeForExtension(extension: string): string {
  return extension === '.md' ? 'text/markdown' : 'text/plain'
}

/**
 * Validates and reads an attached file. Extension-based validation, not `file.type` —
 * browsers are inconsistent about the MIME type they report for .md files.
 */
export async function readAttachedFile(file: File): Promise<{ attachment: ChatAttachment } | { error: string }> {
  const extension = extensionOf(file.name)
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return { error: `"${file.name}": only .txt and .md files are supported.` }
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { error: `"${file.name}" is too large (max ${MAX_ATTACHMENT_BYTES / (1024 * 1024)}MB).` }
  }

  try {
    const content = await file.text()
    return {
      attachment: { id: crypto.randomUUID(), name: file.name, type: mimeForExtension(extension), content },
    }
  } catch {
    return { error: `Could not read "${file.name}".` }
  }
}

/**
 * Dynamic, per-request addition to the system message — kept out of the persisted/
 * user-editable prompt entirely, since which files are attached is per-message data,
 * not something that belongs in a saved prompt.
 */
export function formatAttachmentsForPrompt(attachments: ChatAttachment[]): string {
  if (attachments.length === 0) return ''
  const lines = attachments.map((a) => `- id: ${a.id}, name: "${a.name}", type: "${a.type}"`)
  return `\n\nCurrently attached files (use read_text_file with the id to read one):\n${lines.join('\n')}`
}
