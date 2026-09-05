import type { LabelCatalogue } from './label-catalogue'
import type { IngestionRowLabels } from './types'

/**
 * What category and subcategory hold before anyone has said anything: nothing.
 *
 * They used to start at `outros`, which read on every screen as a decision somebody had
 * made — a category called "other" is a statement, and the app was making it on the
 * user's behalf for every row of every import. An empty cell says what is true: nobody
 * has looked at this yet.
 */
export const UNLABELLED = ''

/** What that default used to be, still recognised as "nobody has said" wherever it survives. */
export const LEGACY_DEFAULT_MEANING = 'outros'

/**
 * What a row still needs before it can be confirmed.
 *
 * Three things are required: which account the money moved through, and where the row
 * belongs — its sections and its screens. Every movement sat in an account, so a row that
 * does not say which is genuinely incomplete; a card is different, because a Pix, a
 * salary or a transfer never touched one, and empty is the true answer rather than a gap.
 * Category and subcategory are never required — a row can be placed before it is
 * understood — and never wrong, since nothing validates free text. A screen is checked *within* the sections the
 * row names, because two sections may offer screens of the same name and the pair is what
 * identifies a table; an account and a card, when given, are checked against what the
 * user set up in Settings.
 */
export function ingestionLabelErrors(labels: IngestionRowLabels, catalogue?: LabelCatalogue): string[] {
  const errors: string[] = []
  if (!labels.account?.trim()) errors.push('Name the account this row belongs to.')
  if (!labels.sections?.length) errors.push('Name the section this row belongs to.')
  if (!labels.screens?.length) errors.push('Name the screen this row belongs to.')
  if (!catalogue) return errors

  const unknownSections = (labels.sections ?? []).filter((value) => !catalogue.sections.some((section) => section.id === value))
  if (unknownSections.length > 0) errors.push(`No section is called ${unknownSections.join(', ')}.`)

  if (labels.account && !catalogue.accounts.some((account) => account.label === labels.account)) {
    errors.push(`No account is called ${labels.account}. Set it up in Settings, or leave the cell empty.`)
  }
  if (labels.card && !catalogue.cards.some((card) => card.label === labels.card)) {
    errors.push(`No card is called ${labels.card}. Set it up in Settings, or leave the cell empty.`)
  }

  for (const screen of labels.screens ?? []) {
    const offeredBy = catalogue.screens.filter((item) => item.id === screen).map((item) => item.sectionId)
    if (offeredBy.length === 0) { errors.push(`No screen is called ${screen}.`); continue }
    if (labels.sections?.length && !offeredBy.some((sectionId) => labels.sections!.includes(sectionId))) {
      errors.push(`${screen} is a screen of ${offeredBy.join(', ')}, which this row does not name.`)
    }
  }
  return errors
}
