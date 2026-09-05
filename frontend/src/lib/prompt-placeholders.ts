import { buildLabelCatalogue } from '@/lib/label-catalogue-source'

/**
 * Values a saved prompt cannot hold as text, because they change while the app runs.
 *
 * The set of sections and screens is what the placement labels are validated against,
 * and it grows with the app — so a guide that listed them in prose would start lying
 * the day a screen was added. The stored text carries a placeholder instead, filled
 * in at the moment the prompt is used.
 *
 * A prompt that has lost its placeholder is not a prompt with a small mistake in it:
 * the model would be told to use labels without being told which exist. Such a prompt
 * is refused rather than sent, and the editor says why.
 */
export const PROMPT_PLACEHOLDERS = {
  sections: '[PLACEHOLDER_FOR_SECTIONS]',
  screens: '[PLACEHOLDER_FOR_SCREENS]',
} as const

export type PlaceholderName = keyof typeof PROMPT_PLACEHOLDERS

/** Which placeholders each stored prompt must keep. Keyed by the prompt's own key. */
export const REQUIRED_PLACEHOLDERS: Record<string, PlaceholderName[]> = {
  ingestionGuide: ['sections', 'screens'],
}

export function missingPlaceholders(promptKey: string, content: string): PlaceholderName[] {
  return (REQUIRED_PLACEHOLDERS[promptKey] ?? []).filter((name) => !content.includes(PROMPT_PLACEHOLDERS[name]))
}

/** What the model is told instead, when the text it would have been given is unusable. */
export function placeholderFailureMessage(missing: PlaceholderName[]): string {
  return [
    `This instruction cannot be used: its saved text is missing ${missing.map((name) => PROMPT_PLACEHOLDERS[name]).join(' and ')}.`,
    'Those placeholders are where the current sections and screens are filled in, and without them you would be told to use labels without being told which ones exist.',
    `Tell the user to put ${missing.length > 1 ? 'them' : 'it'} back in Settings → Assistant, or to reset that instruction to its default, and do not guess the labels in the meantime.`,
  ].join(' ')
}

/**
 * Fills the placeholders from the live catalogue, or explains why it cannot.
 * `translate` decides the language the names are listed in.
 */
export function renderPrompt(promptKey: string, content: string, translate: (key: string) => string): string {
  const missing = missingPlaceholders(promptKey, content)
  if (missing.length > 0) return placeholderFailureMessage(missing)

  const catalogue = buildLabelCatalogue(translate)
  const sections = catalogue.sections.map((section) => `${section.id} (${section.label})`).join(', ')
  const screens = catalogue.screens
    .map((item) => `${item.id} (${item.label}, in ${item.sectionId})`)
    .join(', ')
  return content
    .replaceAll(PROMPT_PLACEHOLDERS.sections, sections)
    .replaceAll(PROMPT_PLACEHOLDERS.screens, screens)
}
