import { isFixedIncome, isVariableIncome } from '@/lib/model/investment-rows'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

export interface HoldingsSplit {
  fixedIncome: number
  variableIncome: number
  /** Holdings whose class nobody named — money that is invested but unsorted. */
  unclassified: number
  /** What is not invested: capital, less everything held. */
  cash: number
}

/**
 * Capital divided into what it is kept as.
 *
 * The holdings come from the investment rows the same way the capital line reads them —
 * written from the account's point of view, so money placed is negative and what is held
 * is the negative of their sum. Cash is the remainder: capital is cash plus holdings by
 * construction, so what is not in a fund is in an account.
 *
 * Every part is floored at zero. A class that has been redeemed to nothing is not a
 * negative holding, and a pie cannot draw one; capital below zero means the opening
 * balance is missing rather than that the cash reserve is negative.
 */
export function holdingsSplit(capital: number, investments: FilteredEntry[]): HoldingsSplit {
  let fixedIncome = 0
  let variableIncome = 0
  let unclassified = 0

  for (const row of investments) {
    const held = -row.value
    if (isFixedIncome(row)) fixedIncome += held
    else if (isVariableIncome(row)) variableIncome += held
    else unclassified += held
  }

  const invested = Math.max(0, fixedIncome) + Math.max(0, variableIncome) + Math.max(0, unclassified)
  return {
    fixedIncome: Math.max(0, fixedIncome),
    variableIncome: Math.max(0, variableIncome),
    unclassified: Math.max(0, unclassified),
    cash: Math.max(0, capital - invested),
  }
}
