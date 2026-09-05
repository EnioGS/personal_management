import { sections } from '@/sections'
import type { LabelCatalogue } from '@/lib/model/label-catalogue'

/**
 * The catalogue, built from the navigation registry the app is actually rendered
 * from — so a section or screen added tomorrow is a valid label the same day, with
 * nothing to keep in step by hand.
 *
 * Every section is offered: what a row belongs to is the user's judgement, and a
 * screen that holds no table today may hold one tomorrow.
 */
export function buildLabelCatalogue(translate: (key: string) => string): LabelCatalogue {
  return {
    sections: sections.map((section) => ({ id: section.id, label: translate(section.labelKey) })),
    screens: sections.flatMap((section) =>
      section.items.map((item) => ({ id: item.id, sectionId: section.id, label: translate(item.labelKey) })),
    ),
  }
}
