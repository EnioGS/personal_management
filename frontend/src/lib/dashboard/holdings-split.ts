import { isCashReserve, isFixedIncome, isVariableIncome } from '@/lib/model/investment-rows'
import type { FilteredEntry } from '@/components/dashboard/use-dashboard-entries'

export interface HoldingsSplit {
  fixedIncome: number
  variableIncome: number
  /** The reserve, held as money on purpose — a class a row names, like any other. */
  cash: number
  /** Holdings whose class nobody named — money that is invested but unsorted. */
  unclassified: number
}

/**
 * The holdings, divided by the class each row names.
 *
 * Every part comes from the investment rows and nowhere else — the cash reserve included,
 * which is money deliberately held as money and says so on its own row. What is left in
 * the accounts is not a reserve; it is simply not invested yet, and calling it one would
 * put the capital line's arithmetic inside a pie about holdings.
 *
 * The rows are written from the account's point of view, the same way the capital line
 * reads them: money placed is negative, so what is held is the negative of their sum. A
 * class redeemed to nothing is floored at zero, since a pie cannot draw a negative slice.
 */
export function holdingsSplit(investments: FilteredEntry[]): HoldingsSplit {
  let fixedIncome = 0
  let variableIncome = 0
  let cash = 0
  let unclassified = 0

  for (const row of investments) {
    const held = -row.value
    if (isCashReserve(row)) cash += held
    else if (isFixedIncome(row)) fixedIncome += held
    else if (isVariableIncome(row)) variableIncome += held
    else unclassified += held
  }

  return {
    fixedIncome: Math.max(0, fixedIncome),
    variableIncome: Math.max(0, variableIncome),
    cash: Math.max(0, cash),
    unclassified: Math.max(0, unclassified),
  }
}
