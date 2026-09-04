import { describe, expect, it } from 'vitest'
import { parseNumberValue } from './parse-number'

describe('parseNumberValue', () => {
  it('reads the comma as a decimal point, which is what a Brazilian statement means', () => {
    expect(parseNumberValue('87,40')).toBe(87.4)
    expect(parseNumberValue('-2.539,24')).toBe(-2539.24)
    expect(parseNumberValue('R$ 1.180,55')).toBe(1180.55)
  })

  it('still reads the other convention, in the same session', () => {
    expect(parseNumberValue('1,234.56')).toBe(1234.56)
    expect(parseNumberValue('12.50')).toBe(12.5)
    expect(parseNumberValue(-34.9)).toBe(-34.9)
  })

  it('treats a lone separator with three digits after it as a thousands group', () => {
    expect(parseNumberValue('1,234')).toBe(1234)
    expect(parseNumberValue('1.234')).toBe(1234)
  })

  it('understands the ways a statement writes a negative', () => {
    expect(parseNumberValue('(87,40)')).toBe(-87.4)
    expect(parseNumberValue('87,40-')).toBe(-87.4)
  })

  it('refuses what is not a number at all', () => {
    expect(parseNumberValue('Pagamento de fatura')).toBeNull()
    expect(parseNumberValue('')).toBeNull()
    expect(parseNumberValue(undefined)).toBeNull()
  })
})
