import { TABLE_KIND_SCHEMAS } from './table-kinds'
import type { LabelCatalogue } from './label-catalogue'
import type {
  EntryLabels,
  IngestionRow,
  IngestionRowLabels,
  IngestionTargetField,
  TableKind,
} from './types'

/** Canonical source mapping used to satisfy a destination table's schema. */
const TARGET_FOR_ENTRY_COLUMN: Record<string, IngestionTargetField> = {
  date: 'date',
  direction: 'direction',
  category: 'rawCategory',
  description: 'description',
  amount: 'amount',
  asset: 'asset',
  type: 'investmentType',
  investmentClass: 'investmentClass',
  quantity: 'quantity',
  price: 'price',
  note: 'note',
  destination: 'destination',
}

/**
 * Every canonical source value a source must be able to provide before it can be
 * staged for the listed table kinds. Values can still be blank per row; a blank
 * supplemental column makes the shape explicit and that row fails final validation.
 */
export function requiredIngestionFieldsForKinds(kinds: readonly TableKind[]): IngestionTargetField[] {
  const fields = new Set<IngestionTargetField>()
  for (const kind of kinds) {
    for (const column of TABLE_KIND_SCHEMAS[kind]) {
      const target = TARGET_FOR_ENTRY_COLUMN[String(column.key)]
      if (target) fields.add(target)
    }
  }
  return [...fields]
}

/** All current table kinds: the conservative requirement before a row has labels. */
export function allPotentialIngestionFields(): IngestionTargetField[] {
  return requiredIngestionFieldsForKinds(Object.keys(TABLE_KIND_SCHEMAS) as TableKind[])
}

/**
 * Reports what a staged row still needs.
 *
 * The placement labels are checked against the catalogue the app currently has rather
 * than a list written here, so adding a screen adds a valid label with nothing to
 * update. Callers that have no catalogue to hand (a pure validity check on values
 * already resolved) can omit it and get the completeness checks alone.
 */
export function ingestionLabelErrors(labels: IngestionRowLabels, destinationTableId?: number, catalogue?: LabelCatalogue): string[] {
  const errors: string[] = []
  if (!labels.sections?.length) errors.push('Name the section this row belongs to.')
  if (!labels.subsections?.length) errors.push('Name the screen this row belongs to.')
  if (catalogue) {
    const unknownSections = (labels.sections ?? []).filter((value) => !catalogue.sections.some((section) => section.id === value))
    const unknownScreens = (labels.subsections ?? []).filter((value) => !catalogue.subsections.some((item) => item.id === value))
    if (unknownSections.length > 0) errors.push(`No section is called ${unknownSections.join(', ')}.`)
    if (unknownScreens.length > 0) errors.push(`No screen is called ${unknownScreens.join(', ')}.`)
  }
  if (!labels.flowRole) errors.push('Choose a flow role.')
  if (!labels.settlementChannel) errors.push('Choose a settlement channel.')
  if (!labels.recurrence) errors.push('Choose a recurrence label.')
  if (!destinationTableId) errors.push('Choose a destination table.')

  if (labels.subsections?.includes('spending')) {
    if (!labels.spendingTreatment || labels.spendingTreatment === 'notApplicable') {
      errors.push('Choose expense or rebate for a spending row.')
    }
    if (!labels.categoryId) errors.push('Choose a semantic category for a spending row.')
  } else if (!labels.spendingTreatment) errors.push('Choose a spending treatment.')

  return errors
}

/** Produces the label sidecar that belongs to a confirmed/promoted ingestion row. */
export function entryLabelsFromIngestionRow(entryId: number, row: IngestionRow): EntryLabels {
  const errors = ingestionLabelErrors(row.labels, row.destinationTableId)
  if (errors.length > 0) throw new Error(`Cannot create entry labels: ${errors.join(' ')}`)

  return {
    entryId,
    sections: row.labels.sections!,
    subsections: row.labels.subsections!,
    flowRole: row.labels.flowRole!,
    settlementChannel: row.labels.settlementChannel!,
    spendingTreatment: row.labels.spendingTreatment!,
    categoryId: row.labels.categoryId,
    recurrence: row.labels.recurrence!,
  }
}

