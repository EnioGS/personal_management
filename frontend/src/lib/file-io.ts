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

interface SaveBinaryFileOptions {
  filename: string
  contents: Uint8Array
  mimeType?: string
  extension?: string
  description?: string
}

/** Same picker-then-download-fallback shape as `saveTextFile`, for a binary payload (e.g. a SQLite export). */
export async function saveBinaryFile({
  filename,
  contents,
  mimeType = 'application/octet-stream',
  extension,
  description,
}: SaveBinaryFileOptions): Promise<void> {
  // sql.js's `Database.export()` types its result as `Uint8Array<ArrayBufferLike>`,
  // which admits a SharedArrayBuffer backing and so isn't assignable to the plain
  // `ArrayBuffer`-backed types `write`/`Blob` want — copy into a fresh, ordinary one.
  const bytes = Uint8Array.from(contents)

  if (supportsFileSystemAccess()) {
    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: filename,
        types: extension ? [{ description, accept: { [mimeType]: [extension] } }] : undefined,
      })
      const writable = await handle.createWritable()
      await writable.write(bytes)
      await writable.close()
      return
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled the picker
      throw err
    }
  }

  const blob = new Blob([bytes], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
