import { describe, expect, it } from 'vitest'
import { allPotentialIngestionFields, entryLabelsFromIngestionRow, ingestionLabelErrors, requiredIngestionFieldsForKinds } from './ingestion'
import type { IngestionRow } from './types'

describe('ingestion mapping requirements', () => {
  it('requires the union of every possible destination schema before labels narrow the destination', () => {
    expect(allPotentialIngestionFields()).toEqual(
      expect.arrayContaining(['date', 'amount', 'direction', 'rawCategory', 'description', 'asset', 'investmentType', 'quantity', 'price', 'note', 'destination']),
    )
  })

  it('uses only the selected table kinds once a destination is known', () => {
    expect(requiredIngestionFieldsForKinds(['cardLedger'])).toEqual(['date', 'rawCategory', 'description', 'amount'])
  })
})

describe('ingestion label completeness', () => {
  const base: IngestionRow = {
    sourceId: 1,
    sourceRowIndex: 0,
    sourceRowFingerprint: 'row',
    rawValues: {},
    mappedValues: {},
    labels: {},
    status: 'unlabelled',
    validationErrors: [],
  }

  it('requires explicit card spending treatment and semantic category for spending rows', () => {
    const errors = ingestionLabelErrors(
      {
        financeDestinations: ['spending'],
        flowRole: 'outflow',
        settlementChannel: 'creditCard',
        spendingTreatment: 'notApplicable',
        recurrence: 'oneOff',
      },
      1,
    )

    expect(errors).toEqual(expect.arrayContaining(['Choose expense or rebate for a spending row.', 'Choose a semantic category for a spending row.']))
  })

  it('builds an entry sidecar only from a complete row', () => {
    const row: IngestionRow = {
      ...base,
      destinationTableId: 4,
      labels: {
        financeDestinations: ['movements', 'spending'],
        flowRole: 'outflow',
        settlementChannel: 'checkingAccount',
        spendingTreatment: 'expense',
        categoryId: 7,
        recurrence: 'oneOff',
      },
    }

    expect(entryLabelsFromIngestionRow(9, row)).toMatchObject({ entryId: 9, categoryId: 7, financeDestinations: ['movements', 'spending'] })
  })
})
