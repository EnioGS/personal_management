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
 * Every section is offered: what a row belongs to is the user's judgement, and a
 * screen that holds no table today may hold one tomorrow.
 */
export function buildLabelCatalogue(translate: (key: string) => string, vocabulary: LabelVocabulary = {}): LabelCatalogue {
  return {
    sections: sections.map((section) => ({ id: section.id, label: translate(section.labelKey) })),
    screens: sections.flatMap((section) =>
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
