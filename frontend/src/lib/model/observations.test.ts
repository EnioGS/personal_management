import { describe, expect, it } from 'vitest'
import { readObservations, sourceFilenameOf, withObservation } from './observations'

describe('the condensed column, read back', () => {
  it('gives back what the file said that no column was assigned to', () => {
    expect(readObservations('{"descricao":"MERCADO","tipo":"D"}')).toEqual({ descricao: 'MERCADO', tipo: 'D' })
  })

  it('is where a row says which file it came from', () => {
    expect(sourceFilenameOf('{"source_filename":"nubank.csv","descricao":"MERCADO"}')).toBe('nubank.csv')
  })

  it('treats observations somebody typed over as holding nothing in particular', () => {
    expect(readObservations('paid in cash at the door')).toEqual({})
    expect(sourceFilenameOf('paid in cash at the door')).toBe('')
    expect(sourceFilenameOf('[1,2,3]')).toBe('')
  })

  it('adds a value without losing what was already there', () => {
    const observations = withObservation('{"descricao":"MERCADO"}', 'source_filename', 'added by hand')

    expect(readObservations(observations)).toEqual({ descricao: 'MERCADO', source_filename: 'added by hand' })
  })
})
