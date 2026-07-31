declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string
      types?: { description?: string; accept: Record<string, string[]> }[]
    }) => Promise<FileSystemFileHandle>
  }
}

/** File System Access API — Chromium-only (Chrome/Edge/Opera); no Firefox/Safari support. */
export function supportsFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
}

interface SaveTextFileOptions {
  filename: string
  contents: string
  mimeType?: string
  extension?: string
  description?: string
}

/**
 * Saves text to a file the user picks. Uses the native "choose a location" picker where
 * available; falls back to a plain browser download everywhere else (Firefox, Safari).
 */
export async function saveTextFile({
  filename,
  contents,
  mimeType = 'application/json',
  extension,
  description,
}: SaveTextFileOptions): Promise<void> {
  if (supportsFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: filename,
        types: extension ? [{ description, accept: { [mimeType]: [extension] } }] : undefined,
      })
      const writable = await handle.createWritable()
      await writable.write(contents)
      await writable.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled the picker
      throw err
    }
  }

  const blob = new Blob([contents], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
