import type { LabelCatalogue } from './label-catalogue'
import type { IngestionRowLabels } from './types'

/** What category and subcategory hold before anyone has said anything more precise. */
export const DEFAULT_MEANING = 'outros'

/**
 * What a row still needs before it can be confirmed.
 *
 * Only placement is required: a row has to say where it belongs before it can go there.
 * Category and subcategory are never missing — they default to `outros` — and never
 * wrong, since nothing validates free text. A screen is checked *within* the sections
 * the row names, because two sections may offer screens of the same name and the pair is
 * what identifies a table.
 */
export function ingestionLabelErrors(labels: IngestionRowLabels, catalogue?: LabelCatalogue): string[] {
  const errors: string[] = []
  if (!labels.sections?.length) errors.push('Name the section this row belongs to.')
  if (!labels.screens?.length) errors.push('Name the screen this row belongs to.')
  if (!catalogue) return errors

  const unknownSections = (labels.sections ?? []).filter((value) => !catalogue.sections.some((section) => section.id === value))
  if (unknownSections.length > 0) errors.push(`No section is called ${unknownSections.join(', ')}.`)

  for (const screen of labels.screens ?? []) {
    const offeredBy = catalogue.screens.filter((item) => item.id === screen).map((item) => item.sectionId)
    if (offeredBy.length === 0) { errors.push(`No screen is called ${screen}.`); continue }
    if (labels.sections?.length && !offeredBy.some((sectionId) => labels.sections!.includes(sectionId))) {
      errors.push(`${screen} is a screen of ${offeredBy.join(', ')}, which this row does not name.`)
    }
  }
  return errors
}
