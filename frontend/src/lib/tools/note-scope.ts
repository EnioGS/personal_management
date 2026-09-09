import { loadLabelCatalogue } from '@/lib/label-catalogue-source'
import { resolveAccountLabel, resolveCardLabel, resolveScreenLabel, resolveSectionLabel } from '@/lib/model/label-catalogue'
import { scopeRefusal } from '@/lib/model/classification-notes'
import { NOTE_SCOPE_FIELDS, type NoteScope } from '@/lib/model/types'

/**
 * Everything wrong with a scope, or null.
 *
 * A scope is only worth having if it can be trusted to mean something. Left to prose it
 * does not: the first memory written under this design scoped itself to
 * `screen: confirmed finance data` — not a screen, and so a scope nothing can be looked
 * up by — with every other field `global`, which turned one entry into the place
 * everything went. So the four fields that have a vocabulary are checked against it, and
 * a scope that narrows nothing at all is refused.
 */
export async function scopeProblem(scope: NoteScope, translate: (key: string) => string): Promise<string | null> {
  const refusal = scopeRefusal(scope)
  if (refusal) return refusal

  if (NOTE_SCOPE_FIELDS.every((field) => scope[field].trim().toLowerCase() === 'global')) {
    return 'This is scoped to everything, which says nothing about what it is about. Name at least one of: the account, the card, the section, the screen, the class, the category, the subcategory, or which lines. A fact that genuinely holds everywhere still came up somewhere — say where.'
  }

  // The four with a vocabulary. class, category and subcategory are free text by design,
  // and `lines` is a sentence, so those are taken as written.
  const catalogue = await loadLabelCatalogue(translate)
  const wrong: string[] = []
  if (!allowed(scope.section) && !resolveSectionLabel(catalogue, scope.section)) {
    wrong.push(`section "${scope.section}" — there is ${list(catalogue.sections.map((entry) => entry.label))}`)
  }
  if (!allowed(scope.screen) && !resolveScreenLabel(catalogue, scope.screen)) {
    wrong.push(`screen "${scope.screen}" — there is ${list(catalogue.screens.map((entry) => entry.label))}`)
  }
  if (!allowed(scope.account) && !resolveAccountLabel(catalogue, scope.account)) {
    wrong.push(`account "${scope.account}" — there is ${list(catalogue.accounts.map((entry) => entry.label))}`)
  }
  if (!allowed(scope.card) && !resolveCardLabel(catalogue, scope.card)) {
    wrong.push(`card "${scope.card}" — there is ${list(catalogue.cards.map((entry) => entry.label))}`)
  }
  if (wrong.length === 0) return null
  return `A scope names things that exist, so it can be found again. ${wrong.join('; ')}. Write "global" where the field does not narrow this.`
}

function allowed(value: string): boolean {
  return value.trim().toLowerCase() === 'global'
}

function list(labels: string[]): string {
  return labels.length > 0 ? labels.map((label) => `"${label}"`).join(', ') : 'none set up'
}
