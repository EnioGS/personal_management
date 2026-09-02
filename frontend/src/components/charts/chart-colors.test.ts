import { describe, expect, it } from 'vitest'
import { CATEGORICAL_PALETTE, chartSafeKey, colorForKey, MAX_CATEGORICAL_SERIES } from './chart-colors'

describe('colorForKey', () => {
  it('is stable: the same key always resolves to the same color', () => {
    expect(colorForKey('Alimentação')).toEqual(colorForKey('Alimentação'))
  })

  it('does not depend on any other key being present — color follows the entity, not its rank', () => {
    // Simulates a filter removing "Transporte": "Alimentação" must keep its own color
    // rather than shifting into whatever slot its new array position implies.
    const withBoth = ['Alimentação', 'Transporte'].map(colorForKey)
    const withOneRemoved = ['Alimentação'].map(colorForKey)

    expect(withOneRemoved[0]).toEqual(withBoth[0])
  })

  it('only ever returns a color from the validated palette', () => {
    const color = colorForKey('anything at all')
    expect(CATEGORICAL_PALETTE).toContainEqual(color)
  })

  it('gives different keys different colors, at least most of the time', () => {
    const keys = ['Alimentação', 'Transporte', 'Lazer', 'Saúde', 'Contas', 'Outros']
    const colors = new Set(keys.map((k) => colorForKey(k).light))
    // Not a strict guarantee (hashing can collide) — just confirms it isn't returning
    // the same slot for every key by accident.
    expect(colors.size).toBeGreaterThan(1)
  })
})

describe('chartSafeKey', () => {
  it('leaves a bare identifier untouched', () => {
    expect(chartSafeKey('Alimentacao')).toBe('Alimentacao')
  })

  it('replaces spaces and other non-identifier characters', () => {
    // This is the exact bug it exists to prevent: `var(--color-Banco Inter)` is
    // invalid CSS and silently renders with no color at all — no error, just a
    // blank mark, which is why every chart wrapper must route through this.
    expect(chartSafeKey('Banco Inter')).toBe('Banco_Inter')
    expect(chartSafeKey('Renda Variável (R$)')).toBe('Renda_Vari_vel__R__')
  })

  it('never returns an empty string', () => {
    expect(chartSafeKey('')).toBe('series')
  })
})

describe('MAX_CATEGORICAL_SERIES', () => {
  it('reserves exactly one palette slot for an "other" bucket', () => {
    expect(MAX_CATEGORICAL_SERIES).toBe(CATEGORICAL_PALETTE.length - 1)
  })
})
