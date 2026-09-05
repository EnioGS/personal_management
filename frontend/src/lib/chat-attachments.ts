export interface ChatAttachment {
  id: string
  name: string
  type: string
  /**
   * The file itself: text for a text file, a `data:` URL for an image.
   *
   * The two are read differently and travel differently — a text file is read by a tool
   * when the assistant asks for it, an image rides along inside the message, since there
   * is no such thing as reading an image a paragraph at a time.
   */
  content: string
  /** Absent on anything attached before images were: a file with no kind is a text file. */
  kind?: 'text' | 'image'
}

/** Images travel inside the message; everything else is read by a tool on request. */
export function isImageAttachment(attachment: ChatAttachment): boolean {
  return attachment.kind === 'image'
}

const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024 // 2MB
/** Images are one thing the model has to be handed whole, and base64 adds a third again. */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_EXTENSIONS = ['.txt', '.md', '.csv']
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']

function extensionOf(filename: string): string {
  const dotIndex = filename.lastIndexOf('.')
  return dotIndex === -1 ? '' : filename.slice(dotIndex).toLowerCase()
}

function mimeForExtension(extension: string): string {
  if (extension === '.md') return 'text/markdown'
  if (extension === '.csv') return 'text/csv'
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg'
  if (extension === '.png') return 'image/png'
  if (extension === '.webp') return 'image/webp'
  if (extension === '.gif') return 'image/gif'
  return 'text/plain'
}

/** A file read as a `data:` URL, which is what an image content part carries. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Every extension the picker takes, in the form an `accept` attribute wants. */
export const ACCEPTED_ATTACHMENTS = [...ALLOWED_EXTENSIONS, ...IMAGE_EXTENSIONS].join(',')

/**
 * Validates and reads an attached file. Extension-based validation, not `file.type` —
 * browsers are inconsistent about the MIME type they report for .md files.
 */
export async function readAttachedFile(file: File): Promise<{ attachment: ChatAttachment } | { error: string }> {
  const extension = extensionOf(file.name)
  const isImage = IMAGE_EXTENSIONS.includes(extension)
  if (!isImage && !ALLOWED_EXTENSIONS.includes(extension)) {
    return { error: `"${file.name}": only .txt, .md, .csv and images (${IMAGE_EXTENSIONS.join(', ')}) are supported.` }
  }
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES
  if (file.size > limit) {
    return { error: `"${file.name}" is too large (max ${limit / (1024 * 1024)}MB).` }
  }

  try {
    const content = isImage ? await readAsDataUrl(file) : await file.text()
    return {
      attachment: { id: crypto.randomUUID(), name: file.name, type: mimeForExtension(extension), content, kind: isImage ? 'image' : 'text' },
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
  // Images are not listed: they are in the message itself, where the model can already
  // see them, and a line saying so would only spend tokens describing what it is looking at.
  const readable = attachments.filter((attachment) => !isImageAttachment(attachment))
  if (readable.length === 0) return ''
  const lines = readable.map((a) => `- id: ${a.id}, name: "${a.name}", type: "${a.type}"`)
  return `\n\nCurrently attached files (use read_text_file for .txt/.md, or read_csv for .csv, with the id):\n${lines.join('\n')}`
}
