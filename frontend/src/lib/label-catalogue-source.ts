import { sections } from '@/sections'
import { accountsTable, cardsTable } from '@/lib/model/model-db'
import type { LabelCatalogue } from '@/lib/model/label-catalogue'
import type { Account, Card } from '@/lib/model/types'

/** The accounts and cards a row may be labelled with: the ones still in use, by name. */
export interface LabelVocabulary {
  accounts?: string[]
  cards?: string[]
}

/**
 * The catalogue, built from the navigation registry the app is actually rendered
 * from — so a section or screen added tomorrow is a valid label the same day, with
 * nothing to keep in step by hand.
 *
 * Only the sections that hold rows are offered (`holdsData`): Notes, Vault and Settings
 * are places to work rather than places data goes, and a row labelled into one of them
 * would be confirmed into a table nothing will ever read.
 */
export function buildLabelCatalogue(translate: (key: string) => string, vocabulary: LabelVocabulary = {}): LabelCatalogue {
  const withData = sections.filter((section) => section.holdsData)
  return {
    sections: withData.map((section) => ({ id: section.id, label: translate(section.labelKey) })),
    screens: withData.flatMap((section) =>
      section.items.map((item) => ({ id: item.id, sectionId: section.id, label: translate(item.labelKey) })),
    ),
    accounts: (vocabulary.accounts ?? []).map((name) => ({ id: name, label: name })),
    cards: (vocabulary.cards ?? []).map((name) => ({ id: name, label: name })),
  }
}

/**
 * The catalogue including the accounts and cards, read from storage.
 *
 * Sections come from code and are there synchronously; accounts and cards are the user's
 * own and live in the database, so anything that validates them has to wait for them —
 * which every tool can, being async already.
 */
export async function loadLabelCatalogue(translate: (key: string) => string): Promise<LabelCatalogue> {
  const [accounts, cards] = await Promise.all([accountsTable.toArray(), cardsTable.toArray()])
  const named = <T extends { name: string; archived?: boolean }>(rows: { data: unknown }[]) =>
    rows.map((row) => row.data as T).filter((row) => !row.archived).map((row) => row.name)
  return buildLabelCatalogue(translate, { accounts: named<Account>(accounts), cards: named<Card>(cards) })
}
