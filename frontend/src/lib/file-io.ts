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
  /**
   * Produces the bytes. A function, not the bytes themselves, because the save picker
   * may only be opened while the click that asked for it is still "active" — and
   * building a database export (reading every table, starting sql.js's WebAssembly)
   * takes long enough to spend that activation, after which the browser refuses the
   * picker and the button appears to do nothing at all.
   */
  contents: () => Promise<Uint8Array> | Uint8Array
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
  if (supportsFileSystemAccess()) {
    let handle: FileSystemFileHandle
    try {
      // Opened first, before a single byte is prepared, so the click is still what
      // opened it.
      handle = await window.showSaveFilePicker!({
        suggestedName: filename,
        types: extension ? [{ description, accept: { [mimeType]: [extension] } }] : undefined,
      })
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return // user cancelled the picker
      throw err
    }
    const writable = await handle.createWritable()
    // sql.js's `Database.export()` types its result as `Uint8Array<ArrayBufferLike>`,
    // which admits a SharedArrayBuffer backing and so isn't assignable to the plain
    // `ArrayBuffer`-backed types `write`/`Blob` want — copy into a fresh, ordinary one.
    await writable.write(Uint8Array.from(await contents()))
    await writable.close()
    return
  }

  const blob = new Blob([Uint8Array.from(await contents())], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
