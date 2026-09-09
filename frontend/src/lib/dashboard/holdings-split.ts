import { UNLABELLED_LABEL, type FilteredEntry } from '@/components/dashboard/use-dashboard-entries'
import { isCashReserve, isFixedIncome, isVariableIncome } from '@/lib/model/investment-rows'

export type HoldingClass = 'cash' | 'fixedIncome' | 'variableIncome' | 'unclassified'

export interface HoldingGroup {
  key: HoldingClass
  /** What is held in that class now: everything put in, less everything taken out. */
  value: number
  /** The same, by whatever the rows call the thing itself — the fund, the paper, the pot. */
  children: { key: string; label: string; value: number }[]
}

/**
 * Which pot a row is about.
 *
 * A broker's file is a ledger of one account's cash, so every line is written from that
 * cash's point of view: money going into a fund leaves the cash and is negative, money
 * coming back arrives and is positive. A row about the cash itself — stored, withdrawn,
 * interest paid — is already about the pot it names, and keeps its sign.
 *
 * So what a row adds to the class it names is its value for cash, and the opposite of its
 * value for everything else. Both readings are the same rule seen from the two ends of
 * the same transfer.
 */
export function heldDelta(row: FilteredEntry): number {
  return isCashReserve(row) ? row.value : -row.value
}

export function classOf(row: FilteredEntry): HoldingClass {
  if (isCashReserve(row)) return 'cash'
  if (isFixedIncome(row)) return 'fixedIncome'
  if (isVariableIncome(row)) return 'variableIncome'
  return 'unclassified'
}

/** The three classes, in the order they are always shown; unclassified joins only if used. */
const CLASSES: HoldingClass[] = ['cash', 'fixedIncome', 'variableIncome']

/**
 * The holdings, by class and by what is held inside each.
 *
 * The three classes are always returned, holding anything or not, so a legend does not
 * come and go with the data; unclassified appears only when something is in it, being a
 * prompt to label rather than a fourth kind of money. Anything redeemed to nothing is
 * dropped rather than drawn as a slice of zero, and a class that has gone negative — more
 * taken out than was ever put in, which means a row is missing — is floored at zero.
 */
export function holdingsSplit(investments: FilteredEntry[]): HoldingGroup[] {
  const totals = new Map<HoldingClass, Map<string, number>>()

  for (const row of investments) {
    const group = totals.get(classOf(row)) ?? new Map<string, number>()
    const name = row.subcategory.trim() || row.category.trim() || UNLABELLED_LABEL
    group.set(name, (group.get(name) ?? 0) + heldDelta(row))
    totals.set(classOf(row), group)
  }

  const unclassified = totals.get('unclassified')
  const shown = [...CLASSES, ...(unclassified && sum(unclassified) > 0 ? (['unclassified'] as HoldingClass[]) : [])]

  return shown.map((key) => {
    const group = totals.get(key) ?? new Map<string, number>()
    return {
      key,
      value: Math.max(0, sum(group)),
      children: [...group.entries()]
        .map(([label, value]) => ({ key: `${key}:${label}`, label, value }))
        .filter((child) => child.value > 0.005)
        .sort((left, right) => right.value - left.value),
    }
  })
}

function sum(group: Map<string, number>): number {
  return [...group.values()].reduce((total, value) => total + value, 0)
}

export interface HoldingCategory {
  key: string
  label: string
  value: number
  /** Which class most of it is, so a category is drawn in the colour of what it holds. */
  holdingClass: HoldingClass
  children?: HoldingCategory[]
}

/**
 * What is held, by category and by the subcategories inside it.
 *
 * The class split says what kind of thing a holding is; this says what the user calls it,
 * which is the other question a list of positions is read for. Balances rather than
 * averages — a position is a running total of what went in and out of it, and a position
 * that has been closed is not a position, so anything that nets to nothing is left off.
 */
export function holdingsByCategory(investments: FilteredEntry[]): HoldingCategory[] {
  const totals = new Map<string, Map<string, number>>()
  const classes = new Map<string, Map<HoldingClass, number>>()

  for (const row of investments) {
    const category = row.category.trim() || UNLABELLED_LABEL
    const subcategory = row.subcategory.trim() || UNLABELLED_LABEL
    const group = totals.get(category) ?? new Map<string, number>()
    group.set(subcategory, (group.get(subcategory) ?? 0) + heldDelta(row))
    totals.set(category, group)

    // A category is usually all one class; where it is not, it is drawn as whichever
    // holds most of it, which is what somebody reading the list would call it.
    const byClass = classes.get(category) ?? new Map<HoldingClass, number>()
    byClass.set(classOf(row), (byClass.get(classOf(row)) ?? 0) + Math.abs(heldDelta(row)))
    classes.set(category, byClass)
  }

  return [...totals.entries()]
    .map(([category, group]) => ({
      key: category,
      label: category,
      value: sum(group),
      holdingClass: dominantClass(classes.get(category)),
      children: [...group.entries()]
        .map(([label, value]) => ({ key: `${category}:${label}`, label, value, holdingClass: dominantClass(classes.get(category)) }))
        .filter((child) => child.value > 0.005)
        .sort((left, right) => right.value - left.value),
    }))
    .filter((category) => category.value > 0.005)
    .sort((left, right) => right.value - left.value)
}

function dominantClass(byClass: Map<HoldingClass, number> | undefined): HoldingClass {
  if (!byClass) return 'unclassified'
  return [...byClass.entries()].sort((left, right) => right[1] - left[1])[0][0]
}