/**
 * What a custom property currently resolves to.
 *
 * For the things that cannot read CSS: a canvas is drawn rather than styled, so a colour
 * the rest of the app inherits has to be looked up and handed over as a value.
 */
export function cssValue(property: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(property).trim()
}
