/**
 * Reads a number written the way people and banks actually write them.
 *
 * `Number("87,40")` is NaN, so a Brazilian statement — where the comma *is* the
 * decimal point — fails to parse entirely, and a row that is otherwise perfectly
 * labelled can never be promoted. Both conventions appear in files this app reads,
 * often in the same session, so the separator is worked out per value rather than
 * assumed from a locale setting.
 *
 * The rule is the one a person applies without thinking: whichever of `.` or `,`
 * comes last is the decimal point, and the other groups thousands. A lone comma is a
 * decimal point, because that is what it means in the files this app is for.
 */
export function parseNumberValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').trim()
  if (!text || !/\d/.test(text)) return null

  // Accounting notation: (87,40) is a negative, and a trailing minus is one too.
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /-$/.test(text)
  const digitsAndSeparators = text.replace(/[^\d.,]/g, '')
  if (!digitsAndSeparators) return null

  const lastDot = digitsAndSeparators.lastIndexOf('.')
  const lastComma = digitsAndSeparators.lastIndexOf(',')
  let normalised: string
  if (lastDot === -1 && lastComma === -1) {
    normalised = digitsAndSeparators
  } else {
    const decimalAt = Math.max(lastDot, lastComma)
    const whole = digitsAndSeparators.slice(0, decimalAt).replace(/[.,]/g, '')
    const fraction = digitsAndSeparators.slice(decimalAt + 1).replace(/[.,]/g, '')
    // A separator with three digits after it and nothing else is a thousands group:
    // "1.234" and "1,234" both mean one thousand two hundred and thirty-four.
    normalised = fraction.length === 3 && !/[.,]/.test(digitsAndSeparators.slice(0, decimalAt))
      ? `${whole}${fraction}`
      : `${whole}.${fraction}`
  }

  const parsed = Number(normalised)
  if (!Number.isFinite(parsed)) return null
  return negative ? -parsed : parsed
}
