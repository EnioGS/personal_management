import { describe, expect, it } from 'vitest'
import { detectApiProvider, providerLabel } from './ai-providers'

describe('detectApiProvider', () => {
  it('recognizes an OpenRouter key', () => {
    expect(detectApiProvider('sk-or-v1-abcdef1234567890')).toBe('openrouter')
  })

  it('recognizes an OpenAI key', () => {
    expect(detectApiProvider('sk-abcdef1234567890')).toBe('openai')
  })

  it('recognizes an OpenAI project-scoped key', () => {
    expect(detectApiProvider('sk-proj-abcdef1234567890')).toBe('openai')
  })

  it('returns null for an unrecognized format', () => {
    expect(detectApiProvider('not-a-key')).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(detectApiProvider('  ')).toBeNull()
  })

  it('trims surrounding whitespace before checking', () => {
    expect(detectApiProvider('  sk-or-v1-abc  ')).toBe('openrouter')
  })
})

describe('providerLabel', () => {
  it('returns the human-readable label for a known provider', () => {
    expect(providerLabel('openai')).toBe('OpenAI')
    expect(providerLabel('openrouter')).toBe('OpenRouter')
  })
})
