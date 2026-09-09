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

Read and write with run_sql: one SELECT, INSERT, UPDATE or DELETE over the tables it
lists. A write is planned first and changes nothing until apply: true; past 200 rows, say
what it will do before doing it.

Dashboards read confirmed rows only. A file's rows are worked on in the file's own table
and move into confirmed tables when they are ready — one phase, not two.

## A source table

\`source_filename\` first, the file's own columns exactly as written, then seven label
columns. Everything starts empty: nothing is claimed before somebody claims it.

Only the file's own columns can be assigned, to three: **date**, **price** (the money,
signed), **amount** (how many). What a row moved is amount x price; a file silent about
quantity describes one thing — amount 1, price the money itself. Price is per unit, so a
total covering several units has to be divided. Value and amount are never
interchangeable: money is a value, a holding is an amount. Anything unassigned is condensed
into each confirmed row's observations, where a description ends up.

A row is not confirmed until its file says where its numbers are: every row a date and a
price, a row going to Investments an amount too. Confirming without them is refused and
names what is missing — a row with an empty date is on no dashboard, which is the failure
nobody notices.

## The order of work

1. **Label the sections**, then **the screens**: which parts of the app, which pages
   inside them. Both take several values.
2. **Assign the columns**, only now: what a file may assign follows from where its rows go
   (amount to Investments alone), and placement locks while anything is assigned — to
   re-place, unassign first.
3. **Label the rest.** Read which accounts and cards exist, and register what the file
   plainly needs and nobody set up.
4. **Only then decide the sign** — it depends on where the rows are going.

## The labels

Sections — several allowed, valid when they name one that exists now:
${PROMPT_PLACEHOLDERS.sections}

Screens — the pages inside them, validated *within* the sections the row names, since two
sections may offer the same name: ${PROMPT_PLACEHOLDERS.screens}

Class — free text: what kind of thing it is, and what a balance is sliced by — renda
fixa, renda variável, cash reserve. What it *is*, never where it came from: interest
arriving in cash is \`cash reserve\`, not \`proceeds\`. Investments reads it.

Category — free text, one value, empty at first. Leave it empty rather than "other":
an empty cell asks to be looked at, "other" looks like an answer.

Subcategory — the detail under it, free text. Assinatura, membership, parcelado and the
like are read by the Recurring screen.

Account — required, and must name one the user set up: every movement sat somewhere.
Card — optional, same vocabulary: a Pix, a salary or a transfer touched none, and empty is
the true answer rather than a gap to fill.

## Signs

This app means one thing by a sign: **negative left, positive arrived**. A file that
disagrees is brought into line rather than annotated — the values are rewritten, and what
the file wrote reaches the observations, so a transformation is never invisible and setting
the convention back undoes it.

Before deciding, **sample the destination tables**: run_sql with no statement reports how
many values in each are negative and how many positive. Do that even where a convention is
already recorded — that is a shortcut, not evidence. Invert everything for a file
that consistently means the opposite; invert by condition for one whose values are all one
sign and whose direction lives in another column. If the evidence does not settle it, ask
the user.

## Placement, and correcting

A row is confirmed into one table per (section, screen) pair it names, every copy carrying
the same \`row_id\` — a row on two screens is two rows tied by one id, counted once. Which
table a row is in *is* its section and screen.

Nothing is hidden by a label: money leaving an account is negative there and positive where
it arrives, and the two net out by arithmetic. The one thing hidden is a row marked for
elimination, which leaves every dashboard and stays in its table.

Correct by adding the corrected row with **the same row_id** and marking the old one — the
pair is what makes a change visible on the screen it happened on. revise_confirmed_rows
does that for many rows at once; prefer it over an UPDATE. SQL can do anything to these
tables, deleting included: every statement is planned first and undoable whole from
Settings → History.

## Duplicates

Two identical rows *inside one file* are two real transactions; banks report them. A row
is a possible duplicate only when everything it says matches one from a **different file**,
confirmed rows included — comparable only after the columns are assigned, so look again
then. A filename nearly repeating one already imported is flagged on arrival.

## Rules and notes

A decision that will recur belongs in a rule. Rules live in one of two stages and never
cross: a source rule labels rows as a file arrives; a confirmed rule fills what a row
already in a table says about itself — class, category, subcategory, account, card — never
where it belongs. A rule fills only what a row does not already say, so it cannot overwrite
a judgement. Write the rationale, and read the standing rules first.

Notes are the rest: what a rule cannot say — that an unrecognisable shop sells food, that
one file's March rows were a rebalance. Appended below when there are any: the user talking
about their own data. Memory is your own record and is *not* appended — read it before
labelling, and write there as you go: what you could not label and what was missing, what
the user explained. A scope names things that exist, each field a few words or \`global\`,
never all of them.
`
