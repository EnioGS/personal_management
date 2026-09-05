import { createLocalListStore } from '@/lib/local-store/create-local-list-store'
import { assistantProfilesTable } from '@/lib/chat/conversations-db'
import type { AssistantConfig } from '@/lib/assistant-config'

/** The one profile that is not stored: it is the code's own wording, and cannot be edited. */
export const DEFAULT_PROFILE = 'Default'

export interface AssistantProfile {
  name: string
  /**
   * The connections this profile sends under, cloned from the app's own when it was made
   * — every key, every provider, and which of them was in use.
   *
   * A profile is the whole experiment under one name, so it needs no setting up: it
   * arrives already connected to whatever the default was connected to, and pointing it at
   * another model changes nothing for anybody else.
   */
  connections?: (AssistantConfig & { id: number })[]
  /** Whether this is the profile the next message will be sent under. */
  isActive?: boolean
  /**
   * Only what this profile says differently, keyed by prompt.
   *
   * A profile holding nothing is the default said again, which is what a new profile is:
   * a place to start changing one thing without copying everything else.
   */
  overrides: Record<string, string>
}

export const useAssistantProfilesStore = createLocalListStore<AssistantProfile>(assistantProfilesTable)

/** What a name has to be: something, and not something already taken. */
export function nameRefusal(name: string, existing: string[]): string | null {
  const trimmed = name.trim()
  if (!trimmed) return 'A profile needs a name.'
  if (trimmed.toLowerCase() === DEFAULT_PROFILE.toLowerCase()) return `"${DEFAULT_PROFILE}" is the built-in wording and cannot be taken.`
  if (existing.some((other) => other.trim().toLowerCase() === trimmed.toLowerCase())) return `A profile is already called "${trimmed}".`
  return null
}

export async function createProfile(
  name: string,
  copyFrom: Record<string, string> = {},
  connections: (AssistantConfig & { id: number })[] = [],
): Promise<number> {
  const existing = (await assistantProfilesTable.toArray()).map((row) => (row.data as AssistantProfile).name)
  const refusal = nameRefusal(name, existing)
  if (refusal) throw new Error(refusal)
  await clearActive()
  const id = await assistantProfilesTable.add({
    createdAt: Date.now(),
    data: { name: name.trim(), isActive: true, overrides: { ...copyFrom }, connections: connections.map((entry) => ({ ...entry })) } satisfies AssistantProfile,
  })
  await refreshProfiles()
  return id
}

export async function renameProfile(id: number, name: string): Promise<void> {
  const rows = await assistantProfilesTable.toArray()
  const stored = rows.find((row) => row.id === id)
  if (!stored) throw new Error('That profile was not found.')
  const refusal = nameRefusal(name, rows.filter((row) => row.id !== id).map((row) => (row.data as AssistantProfile).name))
  if (refusal) throw new Error(refusal)
  await assistantProfilesTable.update(id, { data: { ...(stored.data as AssistantProfile), name: name.trim() } })
  await refreshProfiles()
}

export async function deleteProfile(id: number): Promise<void> {
  await assistantProfilesTable.delete(id)
  await refreshProfiles()
}

/** Selecting a profile is the whole of using it: the next message is sent under it. */
export async function selectProfile(id: number | null): Promise<void> {
  await clearActive()
  if (id !== null) {
    const stored = (await assistantProfilesTable.toArray()).find((row) => row.id === id)
    if (stored) await assistantProfilesTable.update(id, { data: { ...(stored.data as AssistantProfile), isActive: true } })
  }
  await refreshProfiles()
}

export async function setOverride(id: number, key: string, text: string): Promise<void> {
  const stored = (await assistantProfilesTable.toArray()).find((row) => row.id === id)
  if (!stored) throw new Error('That profile was not found.')
  const profile = stored.data as AssistantProfile
  const overrides = { ...profile.overrides }
  // Saying the same as the default is not an override; dropping it keeps a profile a list
  // of its differences rather than a copy that drifts as the default improves.
  if (text.trim()) overrides[key] = text
  else delete overrides[key]
  await assistantProfilesTable.update(id, { data: { ...profile, overrides } })
  await refreshProfiles()
}

async function clearActive(): Promise<void> {
  for (const row of await assistantProfilesTable.toArray()) {
    const profile = row.data as AssistantProfile
    if (profile.isActive) await assistantProfilesTable.update(row.id, { data: { ...profile, isActive: false } })
  }
}

async function refreshProfiles(): Promise<void> {
  const { refreshLocalStores } = await import('@/lib/local-store/create-local-list-store')
  await refreshLocalStores('assistantProfiles')
}

/** The profile in force, read straight from the store so every caller sees the same one. */
export function activeProfile(): ({ id: number } & AssistantProfile) | null {
  const rows = useAssistantProfilesStore.getState().items as unknown as ({ id: number } & AssistantProfile)[]
  const active = rows.find((row) => row.isActive)
  return active ? { ...active, overrides: active.overrides ?? {} } : null
}

/** Rewrites a profile's own connections, which are nobody else's. */
export async function setProfileConnections(id: number, connections: (AssistantConfig & { id: number })[]): Promise<void> {
  const stored = (await assistantProfilesTable.toArray()).find((row) => row.id === id)
  if (!stored) throw new Error('That profile was not found.')
  await assistantProfilesTable.update(id, { data: { ...(stored.data as AssistantProfile), connections } })
  await refreshProfiles()
}

/** The one a profile is sending under: whichever it marks active, else the first with a key. */
export function profileConnection(profile: AssistantProfile | null): AssistantConfig | null {
  const connections = profile?.connections ?? []
  return connections.find((entry) => entry.isActive && entry.apiKey) ?? connections.find((entry) => entry.apiKey) ?? null
}

export function activeProfileName(): string {
  return activeProfile()?.name ?? DEFAULT_PROFILE
}
