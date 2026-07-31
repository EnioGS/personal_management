export const PBKDF2_ITERATIONS = 250_000

export interface Envelope {
  salt: string
  iv: string
  ciphertext: string
}

export function toBase64(bytes: ArrayBuffer | Uint8Array) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

export function fromBase64(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0))
}

export async function deriveKey(passphrase: string, salt: Uint8Array) {
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

export async function encryptJson<T>(passphrase: string, value: T): Promise<Envelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  )
  return { salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(ciphertext) }
}

/** Throws on failure (wrong passphrase or corrupt data) — callers decide the fail-closed policy. */
export async function decryptJson<T>(passphrase: string, envelope: Envelope): Promise<T> {
  const key = await deriveKey(passphrase, fromBase64(envelope.salt))
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromBase64(envelope.iv) as BufferSource },
    key,
    fromBase64(envelope.ciphertext) as BufferSource,
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
