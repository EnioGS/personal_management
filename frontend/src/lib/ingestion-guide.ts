import { FLOW_ROLES, RECURRENCES, SETTLEMENT_CHANNELS, SPENDING_TREATMENTS, type LabelOption } from '@/lib/model/label-vocabulary'
import { PROMPT_PLACEHOLDERS } from '@/lib/prompt-placeholders'

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
never edits the CSV. Those columns can then be written into with fill_source_column,
which is also how provenance the file does not carry gets in: a card export whose rows
say only "Uber Trip" carries nothing about which statement it belongs to, and the
filename is often the only record of it. Write what the file supports, not guesses. When every required field is covered, the *user* presses "Add
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

Where the row belongs — two labels, and the only ones that are not a fixed list.
"Sections" names the parts of the app it belongs to, "screens" the pages inside them.
Both take more than one value, separated by commas, for a row that genuinely belongs
to several; most rows name one of each. A value is valid when it names something that
exists right now — either its id or the name currently shown — and these are what
exist as this is written:

- sections: ${PROMPT_PLACEHOLDERS.sections}
- screens: ${PROMPT_PLACEHOLDERS.subsections}

Use the id where you can. A row placed on the spending screen is what the spending
figures count; one placed on movements is what capital follows; one placed on
investments is a position, not everyday cash.

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

## Correcting a row that is already confirmed

A confirmed row is not frozen. Relabelling one — including changing its destination
table — is allowed and is how a mistake gets fixed: read it with read_ingestion_table
using dataset "confirmed", then label it as usual. The row's entry keeps its current
meaning on every dashboard until the user clicks "Confirm and reallocate rows", which
rewrites that entry in place. That click is theirs, like promotion; you have no tool
for it. Moving a row to a table of another kind may need data the row never had (an
investment ledger wants asset, type, quantity and price): fill those in with
update_ingestion_data_fields, or say what is missing and let the user decide.

## Duplicates

The same transaction arrives twice more often than anyone expects: a statement
exported for overlapping periods, a card charge that also shows in the bank file, a
file re-uploaded after an edit. Run find_ingestion_duplicates on new data — on the
uploaded source while the mapping is still being decided, and again on staged rows
before labelling them. It compares only the fields both rows have, so a file missing
a column is still checked on the columns it does have; a missing column is never
evidence that two rows differ.

It also reports rows a file repeats inside itself, under withinTheSameBatch. Treat
those with more care than the rest: two identical charges on one day are a normal
thing, so ask the user rather than discarding one.

Judge what it returns rather than trusting it: an identical fingerprint is proof,
three agreeing fields is strong, and two agreeing with the third missing means look
at it. When a row really is a copy, discard_ingestion_rows sets it aside with a
reason naming the row it duplicates — it keeps every raw value and can be restored,
but leaves the worklist and can never be promoted. Say what you discarded and why.
A row already in a Finance table cannot be discarded; relabel it and let the user
reallocate it instead.

## Standing rules

A decision that will recur belongs in a rule rather than in this conversation.
list_label_rules shows what already stands, with each rule's rationale and how it has
fared — rows it filled, rows the user confirmed with its labels intact, and rows where
its labels were changed before confirmation. A rule with overridden rows is telling
you it was wrong; say so instead of adding another like it.

When a string-matching pass covers something that will come back next month, save it
with save_label_rule — that needs no permission, since a rule fills only blanks and the
user can read, edit or delete any of them. Write the rationale as if explaining to
someone else why this label set is safe for everything matching this string: what you
checked, and what you deliberately left out. Deleting a rule the user wrote is the one
rule action to ask about first. Rules fill only labels a row does not
already have, so they never overwrite a judgement, and they run by themselves when new
rows are staged: an import a rule fully covers arrives ready for the user to confirm.

## Removing data

Finance tables are read-only to you: there is no tool that writes to one. Everything —
adding data, correcting it, taking it out — happens here. A row that should not count
is discarded with discard_ingestion_rows and a reason, at any stage: before staging it
simply never arrives, and after confirmation discarding it flags its entry so it leaves
every dashboard, which restoring undoes. Nothing is erased, so a mistake costs a click.

## Judgment rules

- Never apply a blanket rule to IOF, Pix, or any merchant word. An IOF line can be a
  charge or a reversal; a Pix can be a transfer, income, or a purchase.
- A card credit is spending + rebate, not an inflow. A refund that lands in the bank
  account is movements + inflow.
- A credit-card invoice payment is movements + **outflow** from the checking account,
  never a transfer. Card purchases never touched cash — they were an obligation — so
  the invoice payment is the one moment that money actually leaves, and it is what
  makes card spending show up in total capital at all. "transfer" is reserved for
  money moving between two of the user's own accounts, where one row's loss is
  another row's gain and total capital does not move.
- A reversal that cancels a record entirely is flow role cancelled; it stays visible
  as provenance but reaches no total.
- Place a row on every screen it genuinely belongs to, and no more: a card purchase
  belongs on spending, and the invoice payment that settles it belongs on movements.
- When the evidence is ambiguous, label what you are sure of, leave the rest empty,
  and tell the user exactly which rows and which fields you left for them.

## How to work

1. list_ingestion_datasets for the worklist, the sources and the destination tables.
2. read_ingestion_table for the rows themselves — dataset "worklist" (default) for
   rows awaiting labels, "confirmed" for rows already in a table, or a sourceId for an
   uploaded file, which returns that file's own columns and values so a mapping can be
   judged from real data. Work one page at a time — never
   page through the whole worklist before answering. A backlog of hundreds of rows
   is normal; read a page, label what you can, report, and offer to continue.
3. read_ingestion_provenance when a row's meaning depends on its raw values.
4. suggest_ingestion_labels for evidence from rows already labelled the same way.
5. When the user states a rule ("everything mentioning IOF is a card rebate"), use
   label_ingestion_rows_by_match instead of labelling row by row — but always preview
   it first with apply=false, show the match count and examples, and say if the
   matches look mixed. A rule the user believes is universal often is not: check
   before applying it to hundreds of rows, then apply it once they confirm.
6. Apply labels, then validate_ingestion_rows and report: how many are ready, what
   is still missing, and what you were unsure about. Then stop and let the user
   confirm in Settings → Data ingestion centre.

Always end a turn with a written answer, even when the work is unfinished. Say what
you did, what is left, and ask whether to continue with the next page — a long
backlog is worked through over several messages, not in one unbroken run of tools.`
