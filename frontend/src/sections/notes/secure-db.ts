import Dexie, { type EntityTable } from 'dexie'

interface EncryptedNote {
  id: number
  createdAt: number
  salt: string
  iv: string
  ciphertext: string
}

const db = new Dexie('app-secure-db') as Dexie & {
  notes: EntityTable<EncryptedNote, 'id'>
}

db.version(1).stores({
  notes: '++id, createdAt',
})

const PBKDF2_ITERATIONS = 250_000

function toBase64(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function addNote(passphrase: string, text: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(text),
  )

  await db.notes.add({
    createdAt: Date.now(),
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
  })
}

export interface DecryptedNote {
  id: number
  createdAt: number
  text: string
}

/** Returns null for entries that fail to decrypt (wrong passphrase) instead of throwing. */
export async function listNotes(passphrase: string): Promise<(DecryptedNote | null)[]> {
  const rows = await db.notes.orderBy('createdAt').reverse().toArray()

  return Promise.all(
    rows.map(async (row) => {
      try {
        const key = await deriveKey(passphrase, fromBase64(row.salt))
        const plaintext = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: fromBase64(row.iv) as BufferSource },
          key,
          fromBase64(row.ciphertext) as BufferSource,
        )
        return { id: row.id, createdAt: row.createdAt, text: new TextDecoder().decode(plaintext) }
      } catch {
        return null
      }
    }),
  )
}

export async function deleteNote(id: number) {
  await db.notes.delete(id)
}
