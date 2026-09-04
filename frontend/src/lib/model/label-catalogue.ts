/**
 * What a row can be labelled *with*, read from the app's own navigation.
 *
 * The two placement labels — which section a row belongs to, and which screen inside
 * it — are free text rather than a fixed vocabulary, because the set of screens is a
 * property of the app and changes as it grows. A value is valid when it names a
 * section or a screen that currently exists; nothing has to be edited here when one
 * is added.
 *
 * Stored values are canonical ids, not the words on screen: a person types "Gastos"
 * or "Spending" and either resolves to `spending`, so labelled data survives a change
 * of language. The cells show the current name, whichever was typed.
 */
export interface CatalogueEntry {
  id: string
  label: string
}

export interface SubsectionEntry extends CatalogueEntry {
  sectionId: string
}

export interface LabelCatalogue {
  sections: CatalogueEntry[]
  subsections: SubsectionEntry[]
}

function comparable(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

/** Resolves what someone typed to a section id, by id or by the name now shown. */
export function resolveSectionLabel(catalogue: LabelCatalogue, text: string): string | undefined {
  const wanted = comparable(text)
  return catalogue.sections.find((section) => comparable(section.id) === wanted || comparable(section.label) === wanted)?.id
}

export function resolveSubsectionLabel(catalogue: LabelCatalogue, text: string): string | undefined {
  const wanted = comparable(text)
  return catalogue.subsections.find((item) => comparable(item.id) === wanted || comparable(item.label) === wanted)?.id
}

/** The name to show for a stored id, falling back to the id for anything unrecognised. */
export function sectionLabelFor(catalogue: LabelCatalogue, id: string): string {
  return catalogue.sections.find((section) => section.id === id)?.label ?? id
}

export function subsectionLabelFor(catalogue: LabelCatalogue, id: string): string {
  return catalogue.subsections.find((item) => item.id === id)?.label ?? id
}

/** Parses a cell: several values separated by commas, each resolved on its own. */
export function parsePlacementLabels(
  text: string,
  resolve: (value: string) => string | undefined,
): { values: string[]; unknown: string[] } {
  const parts = text.split(/[,;|]/).map((part) => part.trim()).filter(Boolean)
  const values: string[] = []
  const unknown: string[] = []
  for (const part of parts) {
    const resolved = resolve(part)
    if (resolved) { if (!values.includes(resolved)) values.push(resolved) }
    else unknown.push(part)
  }
  return { values, unknown }
}

/**
 * Fills in the section from the screens, when it was left out.
 *
 * Every screen belongs to exactly one section, so naming both is naming the same fact
 * twice — and a row labelled "spending" but not "finances" was being reported as
 * unlabelled, which is a blocker made of bookkeeping rather than of missing judgement.
 * A section named explicitly is kept: a row can belong to a section beyond the ones
 * its screens imply.
 */
export function withDerivedSections<T extends { sections?: string[]; subsections?: string[] }>(labels: T, catalogue: LabelCatalogue): T {
  if (labels.sections?.length || !labels.subsections?.length) return labels
  const sections = [...new Set(
    labels.subsections
      .map((screen) => catalogue.subsections.find((item) => item.id === screen)?.sectionId)
      .filter((sectionId): sectionId is string => Boolean(sectionId)),
  )]
  return sections.length > 0 ? { ...labels, sections } : labels
}
