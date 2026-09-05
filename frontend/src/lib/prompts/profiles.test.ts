import { beforeEach, describe, expect, it } from 'vitest'
import { wipeAllData } from '@/lib/data-file'
import { assistantProfilesTable } from '@/lib/chat/conversations-db'
import { DEFAULT_PROFILE, createProfile, nameRefusal, profileConnection, selectProfile, setOverride, setProfileConnections } from './profiles'

const named = async () => (await assistantProfilesTable.toArray()).map((row) => row.data as import('./profiles').AssistantProfile)

describe('naming a profile', () => {
  it('refuses nothing, and refuses a name already taken however it is capitalised', () => {
    expect(nameRefusal('  ', [])).toMatch(/needs a name/)
    expect(nameRefusal('Terse', ['terse'])).toMatch(/already called/)
    expect(nameRefusal('default', [])).toMatch(/built-in/)
    expect(nameRefusal('Terse', ['Verbose'])).toBeNull()
  })
})

describe('a profile', () => {
  beforeEach(async () => { await wipeAllData() })

  it('starts as a copy of what it was made from, and becomes the one in force', async () => {
    await createProfile('Terse', { 'tool.mark_rows': 'Marks rows.' })

    const [profile] = await named()
    expect(profile).toMatchObject({ name: 'Terse', isActive: true, overrides: { 'tool.mark_rows': 'Marks rows.' } })
  })

  it('holds only what it says differently: emptying a box drops the override', async () => {
    const id = await createProfile('Terse')
    await setOverride(id, 'tool.mark_rows', 'Marks rows.')
    expect((await named())[0].overrides).toHaveProperty('tool.mark_rows')

    await setOverride(id, 'tool.mark_rows', '   ')
    expect((await named())[0].overrides).toEqual({})
  })

  it('is one at a time, and going back to the default leaves none in force', async () => {
    await createProfile('Terse')
    const second = await createProfile('Verbose')

    expect((await named()).filter((profile) => profile.isActive).map((profile) => profile.name)).toEqual(['Verbose'])

    await selectProfile(second)
    expect((await named()).filter((profile) => profile.isActive)).toHaveLength(1)

    await selectProfile(null)
    expect((await named()).some((profile) => profile.isActive)).toBe(false)
  })

  it('refuses a duplicate rather than making a second one', async () => {
    await createProfile('Terse')
    await expect(createProfile('terse')).rejects.toThrow(/already called/)
  })

  it('leaves the built-in name to the built-in wording', () => {
    expect(nameRefusal(DEFAULT_PROFILE, [])).not.toBeNull()
  })
})

describe('the connections a profile sends under', () => {
  beforeEach(async () => { await wipeAllData() })

  const key = (over: Partial<{ id: number; provider: string; apiKey: string; model: string; isActive: boolean }> = {}) =>
    ({ id: 1, provider: 'openai', apiKey: 'sk-1', model: 'gpt', isActive: true, ...over }) as never

  it('are cloned when it is made, so a new profile is already connected', async () => {
    await createProfile('Terse', {}, [key(), key({ id: 2, provider: 'openrouter', apiKey: 'or-2', isActive: false })])

    const [profile] = await named()
    expect(profile.connections).toHaveLength(2)
    expect(profileConnection(profile)).toMatchObject({ provider: 'openai', apiKey: 'sk-1' })
  })

  it('fall back to any key at all when none is marked active', async () => {
    await createProfile('Terse', {}, [key({ isActive: false })])

    expect(profileConnection((await named())[0])).toMatchObject({ apiKey: 'sk-1' })
  })

  it('are nothing when the profile has none, which is what the default says', async () => {
    await createProfile('Terse', {}, [])

    expect(profileConnection((await named())[0])).toBeNull()
    expect(profileConnection(null)).toBeNull()
  })

  it('are rewritten without touching another profile', async () => {
    const first = await createProfile('Terse', {}, [key()])
    await createProfile('Verbose', {}, [key({ apiKey: 'sk-other' })])

    await setProfileConnections(first, [key({ model: 'gpt-mini' })])

    const profiles = await named()
    expect(profileConnection(profiles.find((profile) => profile.name === 'Terse')!)).toMatchObject({ model: 'gpt-mini' })
    expect(profileConnection(profiles.find((profile) => profile.name === 'Verbose')!)).toMatchObject({ apiKey: 'sk-other' })
  })
})
