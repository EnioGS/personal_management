import { PROMPT_PLACEHOLDERS } from '@/lib/prompt-placeholders'

export const INGESTION_GUIDE_KEY = 'ingestionGuide'

/**
 * The whole ingestion workflow in one retrievable document.
 *
 * Deliberately not part of the system prompt: it is long, and it only matters while data
 * is being worked on. The assistant fetches it the moment a request touches importing,
 * assigning, labelling or confirming, so every other conversation pays none of its tokens.
 *
 * Editable in Settings → Assistant, with a reset to this default.
 */
export const DEFAULT_INGESTION_GUIDE = `# Data ingestion centre

Dashboards read confirmed rows only. A file's rows are worked on in the file's own table
and move into confirmed tables when they are ready — one phase, not two: assigning columns
and labelling happen side by side, on the same rows.

## A source table

\`source_filename\` first, then the file's own columns exactly as written, then seven label
columns. Everything starts empty: nothing about a row is claimed before somebody claims it.

Only the file's own columns can be assigned, to three: **date**, **price** (the money,
signed) and **amount** (how many). What a row moved is amount x price; a file silent about
quantity describes one thing — amount 1, price the money itself. Price is per unit, so a
total covering several units has to be divided. Value and amount are never
interchangeable: money is a value, a holding is an amount. Anything unassigned is condensed
into the observations of each confirmed row, which is where a description ends up.

A row is not confirmed until its file says where its numbers are: every row a date and a
price, and a row going to Investments an amount as well. Confirming
without them is refused and names the missing column — a row landing with an empty date and
value sits in its table and appears on no dashboard, which is the failure nobody notices.

## The order of work

1. **Assign the columns.** Read which accounts and cards exist while you are here, and
   register what the file plainly needs and nobody has set up.
2. **Label the sections.** Which parts of the app the row belongs to.
3. **Label the screens.** Which pages inside those sections. Both take several values.
4. **Only then decide the sign** — it depends on where the rows are going.

## The labels

Sections — several allowed, valid when they name a section that exists now:
${PROMPT_PLACEHOLDERS.sections}

Screens — the pages inside them, validated *within* the sections the row names, since two
sections may offer screens of the same name: ${PROMPT_PLACEHOLDERS.screens}

Class — free text: what kind of thing it is, which is what a balance is sliced by — renda
fixa, renda variável, cash reserve. What it *is*, never where it came from: interest
arriving in cash is class \`cash reserve\`, not \`proceeds\`. Investments reads it.

Category — free text, one value, starts empty. Leave it empty rather than writing a word
like "other": an empty cell asks to be looked at, "other" looks like an answer.

Subcategory — the detail under it, also free text. Assinatura, membership, parcelado and
their equivalents are read by the Recurring screen.

Account — required, and must name one the user set up: every movement sat somewhere.
Card — the same vocabulary, optional: a Pix, a salary or a transfer touched none, and
empty is the true answer there rather than a gap to fill.

## Signs

This app means one thing by a sign: **negative left, positive arrived**. A file that
disagrees is brought into line rather than annotated — the value column is rewritten, and
what the file wrote is kept on the row and reaches the observations, so a transformation is
never invisible and setting the convention back undoes it.

Before deciding, **sample the destination tables**: query_vault with no statement reports
how many values in each are negative and how many positive. Do that even where a convention
is recorded — a recorded reference is a shortcut, not evidence. Invert everything for a file
that consistently means the opposite; invert by condition for one whose values are all one
sign and whose direction lives in another column. If the evidence does not settle it, ask
the user.

## Placement, and correcting

A row is confirmed into one table per (section, screen) pair it names, every copy carrying
the same \`row_id\` — so a row on two screens is two rows tied by one id, counted once
wherever counting is about the row. Which table a row is in *is* its section and screen.

Nothing is hidden by a label: money leaving an account is negative there and positive where
it arrives, and the two net out by arithmetic. The one thing this app hides is a row marked
for elimination, which disappears from every dashboard and stays in its table — that is
what makes marking safe to use freely.

Never edit a confirmed row in place. Add the corrected row with **the same row_id** and mark
the old one; for many rows at once, revise_confirmed_rows does exactly that. Marking and
unmarking are yours and the user's alike. **Deleting is the user's alone.**

## Duplicates

Two identical rows *inside one file* are two real transactions — banks report them. A row is
a possible duplicate only when everything it says matches a row from a **different file**,
or when a newly uploaded file's name is nearly one already imported.

## Rules and notes

A decision that will recur belongs in a rule. Rules live in one of two stages and never
cross: a source rule labels rows as a file arrives, so an import can land already placed; a
confirmed rule fills what a row already in a table says about itself — category,
subcategory, account, card — never where it belongs. A rule fills only what a row does not
already say, so it cannot overwrite a judgement. Write the rationale, and read the standing
rules before adding another.

Notes are the rest: free text about this data, saying what a rule cannot — that a shop
nobody would recognise sells food, that one file's March rows were a rebalance. They are
appended below when there are any. Treat them as the user talking about their own data, and
write one yourself whenever they explain something you would otherwise ask about again.
`
