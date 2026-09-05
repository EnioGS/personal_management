import { describe, expect, it } from 'vitest'
import { staysInMarkMode } from './use-mark-mode'

function render(html: string): HTMLElement {
  document.body.innerHTML = html
  return document.body
}

describe('what keeps the marking mode on', () => {
  it('is a click on a row — which is the click that toggles a mark', () => {
    const body = render('<table><tr data-markable><td id="cell">MERCADO</td></tr></table>')

    expect(staysInMarkMode(body.querySelector('#cell'))).toBe(true)
  })

  it('is also the mode\'s own checkbox, which would otherwise turn itself off', () => {
    const body = render('<label data-mark-toggle><input id="box" type="checkbox"> Mark for elimination</label>')

    expect(staysInMarkMode(body.querySelector('#box'))).toBe(true)
  })

  it('is nothing else: clicking anywhere but a row leaves the mode', () => {
    const body = render('<div><button id="elsewhere">Import new values</button><table><tr data-markable><td>x</td></tr></table></div>')

    expect(staysInMarkMode(body.querySelector('#elsewhere'))).toBe(false)
    expect(staysInMarkMode(null)).toBe(false)
  })
})
