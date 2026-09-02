import type { FinanceDestination, FlowRole, RecurrenceLabel, SettlementChannel, SpendingTreatment } from './types'

/**
 * The single definition of every label value and what it means.
 *
 * The worklist cells, the staging prefill, the assistant's tools and the ingestion
 * guide all read this, so a value can never be accepted in one place and rejected
 * in another, and the explanation shown to the user is the same text the model gets.
 */
export interface LabelOption<T extends string> {
  value: T
  meaning: string
}

export const FINANCE_DESTINATIONS: LabelOption<FinanceDestination>[] = [
  { value: 'movements', meaning: 'Money that moved in or out of an account without being a purchase — transfers, salary, fees, opening balances.' },
  { value: 'spending', meaning: 'A purchase or its reversal. Spending rows are still movements, so Movements keeps counting them.' },
  { value: 'investments', meaning: 'A buy, sell or income event inside an investment ledger. It changes a position rather than everyday cash.' },
]

export const FLOW_ROLES: LabelOption<FlowRole>[] = [
  { value: 'inflow', meaning: 'Money arrived: salary, refund received, interest paid to you.' },
  { value: 'outflow', meaning: 'Money left: a purchase, a bill, a Pix you sent.' },
  { value: 'transfer', meaning: 'Money moved between your own accounts; your total capital is unchanged.' },
  { value: 'adjustment', meaning: 'A correction or opening balance that is not real income or spend.' },
  { value: 'cancelled', meaning: 'Voided or reversed — the row is kept as provenance but must not reach any total.' },
]

export const SETTLEMENT_CHANNELS: LabelOption<SettlementChannel>[] = [
  { value: 'checkingAccount', meaning: 'Settled straight from a bank account balance.' },
  { value: 'creditCard', meaning: 'A credit-card statement event; it becomes cash only when the invoice is paid.' },
  { value: 'cash', meaning: 'Physical cash, with no account record behind it.' },
  { value: 'investment', meaning: 'Settled inside a broker or investment account.' },
  { value: 'other', meaning: 'Anything the four above do not describe; say why in the note.' },
]

export const SPENDING_TREATMENTS: LabelOption<SpendingTreatment>[] = [
  { value: 'expense', meaning: 'Adds to spend for its category and month.' },
  { value: 'rebate', meaning: 'A credit, refund or reversal that subtracts from spend instead of adding to it.' },
  { value: 'notApplicable', meaning: 'The row is not a spending record at all. Required for every non-spending destination.' },
]

export const RECURRENCES: LabelOption<RecurrenceLabel>[] = [
  { value: 'oneOff', meaning: 'Happens once; nothing like it is expected again.' },
  { value: 'recurring', meaning: 'Repeats on a schedule with no end in sight — a subscription, rent, a monthly fee.' },
  { value: 'installment', meaning: 'One purchase split into a fixed number of monthly charges ("parcela 3/10"); it ends on a known date.' },
  { value: 'undecided', meaning: 'Nobody has judged this row yet. Allowed, but the Recurring screen then has to guess from the description.' },
]

export function labelValues<T extends string>(options: LabelOption<T>[]): T[] {
  return options.map((option) => option.value)
}

/** Case-insensitive lookup of a typed value, so the worklist accepts "Inflow" as well. */
export function matchLabelValue<T extends string>(options: LabelOption<T>[], value: string | undefined): T | undefined {
  const wanted = value?.trim().toLowerCase()
  return wanted ? options.find((option) => option.value.toLowerCase() === wanted)?.value : undefined
}
