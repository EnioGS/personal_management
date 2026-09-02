import { FINANCE_DESTINATIONS, FLOW_ROLES, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS, type LabelOption } from '@/lib/model/label-vocabulary'

export const INGESTION_GUIDE_KEY = 'ingestionGuide'

function options<T extends string>(title: string, list: LabelOption<T>[]): string {
  return `${title}\n${list.map((option) => `- ${option.value}: ${option.meaning}`).join('\n')}`
}

/**
 * The whole ingestion workflow in one retrievable document.
 *
 * It is deliberately *not* part of the system prompt: it is long, and it only
 * matters while the user is classifying data. The assistant fetches it with
 * read_ingestion_guide the moment a request touches importing, mapping, labelling
 * or confirming rows, so every other conversation pays none of its tokens.
 *
 * Editable in Settings → Assistant, with a reset to this default.
 */
export const DEFAULT_INGESTION_GUIDE = `# Data ingestion centre — how classification works

Everything the user's dashboards show comes from labelled rows. A row that is not
labelled is not in any finance table at all: it waits in the ingestion worklist.
Your job is to prepare rows so the user can confirm them; you never confirm.

## The two steps and their boundaries

Step 1 — Source mapping. An uploaded CSV keeps its original columns untouched. Each
source column is assigned to one canonical field, and one canonical field takes at
most one source column. A source that lacks a field some destination will need gets
an explicitly blank supplemental column instead (add_ingestion_blank_column); this
never edits the CSV. When every required field is covered, the *user* presses "Add
to imported unlabelled data". You may map and explain, but you cannot perform that
step.

Step 2 — Labelling. Rows sit in "Imported, unlabelled data" with their raw values,
their canonical data fields, and one column per label. You may edit data fields
(update_ingestion_data_fields) and set labels (update_ingestion_labels) for rows you
have read. A row becomes "ready" automatically once every required label is present
and the destination table accepts its values. Moving ready rows into their tables is
the user's click alone — never claim you did it, and never ask for a tool that does.

## Canonical data fields required before step 2

date, amount, description, rawCategory, direction, asset, investmentType, quantity,
price, note, destination. The validator requires the union of what every possible
destination table kind needs, because the destination is not chosen until labelling:
bank rows need date/direction/category/description/amount; card rows date/category/
description/amount; investment rows date/category/asset/type/quantity/price/note;
contributions date/destination/amount; dividends date/asset/amount/note.

## The labels

${options('Finance destination — exactly one, and it decides which screen owns the row:', FINANCE_DESTINATIONS)}

${options('Flow role — the economic direction, never inferred from the sign of the amount:', FLOW_ROLES)}

${options('Settlement channel — what kind of money actually moved:', SETTLEMENT_CHANNELS)}

${options('Spending treatment — required to be expense or rebate when the destination is spending, otherwise notApplicable:', SPENDING_TREATMENTS)}

${options('Recurrence:', RECURRENCES)}

Semantic category — free text and the only open vocabulary. Typing a name that does
not exist yet creates it; there is no rule engine and no category settings screen.
Required for spending rows, optional elsewhere.

Destination table — one of the user's own tables. It carries the details labels do
not: which account or card the row belongs to, and for investments whether the table
is Fixed Income or Variable Income. Call read_table to see what exists.

## Judgment rules

- Never apply a blanket rule to IOF, Pix, or any merchant word. An IOF line can be a
  charge or a reversal; a Pix can be a transfer, income, or a purchase.
- A card credit is spending + rebate, not an inflow. A refund that lands in the bank
  account is movements + inflow.
- A reversal that cancels a record entirely is flow role cancelled; it stays visible
  as provenance but reaches no total.
- The destination is single-valued on purpose: a spending row is still counted as a
  movement by the dashboards, so never ask the user to pick both.
- When the evidence is ambiguous, label what you are sure of, leave the rest empty,
  and tell the user exactly which rows and which fields you left for them.

## How to work

1. list_ingestion_datasets for the worklist, the sources and the destination tables.
2. read_ingestion_table for the rows themselves. Work one page at a time — never
   page through the whole worklist before answering. A backlog of hundreds of rows
   is normal; read a page, label what you can, report, and offer to continue.
3. read_ingestion_provenance when a row's meaning depends on its raw values.
4. suggest_ingestion_labels for evidence from rows already labelled the same way.
5. Apply labels, then validate_ingestion_rows and report: how many are ready, what
   is still missing, and what you were unsure about. Then stop and let the user
   confirm in Settings → Data ingestion centre.

Always end a turn with a written answer, even when the work is unfinished. Say what
you did, what is left, and ask whether to continue with the next page — a long
backlog is worked through over several messages, not in one unbroken run of tools.`
