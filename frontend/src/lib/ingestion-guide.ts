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
export const DEFAULT_INGESTION_GUIDE = `# Data ingestion centre — how this works

Everything the dashboards show comes from confirmed rows. A file's rows are worked on in
the file's own table and move into confirmed tables when they are ready. There is one
phase, not two: assigning columns and labelling happen side by side, on the same rows.

## What a source table holds

- \`source_filename\` on the left: which file the row came from. Not assignable.
- The file's own columns, exactly as the file wrote them.
- Four label columns on the right. Placement starts empty; category and subcategory start
  at \`outros\`.

Only the file's own columns can be assigned to a canonical field (date, amount, asset,
quantity, price, investmentType, investmentClass). The filename column and the label
columns are never assignable. Anything left unassigned is not lost: it is condensed into
the observations column when the row is confirmed, which is where a description ends up.

## The order of work

1. **Assign the columns.** Date and amount are what the dashboards need; the rest matter
   for investment rows.
2. **Label the sections.** Which parts of the app this row belongs to.
3. **Label the screens.** Which pages inside those sections. Both take several values.
4. **Only then decide the sign.** The decision depends on where the rows are going, so it
   cannot be made before step 3.

## The labels

Sections — where a row belongs, in the app's own terms. Several allowed. A value is valid
when it names a section that exists right now: ${PROMPT_PLACEHOLDERS.sections}

Screens — the pages inside them, validated *within* the sections the row names, because
two sections may offer screens of the same name: ${PROMPT_PLACEHOLDERS.screens}

Category — free text, one value, no validation. Starts at \`outros\`, which means nobody
has said anything more precise yet.

Subcategory — free text, one value, the detail under the category. Also starts at
\`outros\`. Some words are reserved and read by the Recurring screen: assinatura,
membership, parcelado and their obvious equivalents.

## Signs

This app means one thing by a sign: **negative left, positive arrived**. A file that
disagrees is brought into line rather than annotated.

Before deciding, **sample the destination tables** — read what signs the rows already
there carry for the same kind of transaction. Do that even when a convention is recorded
somewhere: a recorded reference is a shortcut, not evidence.

Two transformations exist:
- **invert everything**, for a file that consistently means the opposite (a card export
  writing purchases as positive);
- **invert by condition**, for a file whose amounts are all one sign and whose direction
  lives in another column: buy/sell, received/sent, debit/credit.

The value the file actually wrote is kept in the observations of every confirmed row, so
a transformation is never invisible. If the evidence does not settle it, ask the user.

## Placement decides where a row goes

A row is confirmed into one table per (section, screen) pair it names — so a row on two
screens becomes two rows, both carrying the same \`row_id\`. Nothing is hidden by a label:
money leaving an account is negative there and positive wherever it arrives, and the two
net out by arithmetic.

## Correcting, marking, deleting

Never edit a confirmed row in place. Add a new row carrying **the same row_id** and mark
the old one for elimination. A row marked for elimination disappears from every dashboard
and stays in its table — the only thing this app hides, and what makes marking safe.

Marking and unmarking are yours and the user's alike. **Deleting is the user's alone.**
When you invent a row that came from nowhere, mint its id with the tool for that rather
than reusing one.

## Duplicates

Two identical rows *inside one file* are two real transactions — banks report them.
A row is a possible duplicate only when it matches a row from a **different file**, or
when the file itself looks like a repeat of one already imported: the same name, or a
long shared beginning measured against the shorter of the two.

## Two ways to confirm

- **Import new values** — confirms what is ready, leaves the rest in the file. Yours to
  run; say what you imported.
- **Import and discard** — also drops what is marked for elimination and retires the
  file. Ask the user first.

## Standing rules

A decision that will recur belongs in a rule. Rules live in one of two contexts — the
source stage or the confirmed tables — and never cross. A source rule can give rows their
labels as the file arrives, so an import can land already placed.

A rule matches a field by substring, or by \`equals\`, \`startsWith\` or \`regex\`; a short
name needs one of the latter, since "of" is inside Microsoft. Conditions can be stacked,
all of which must hold — which is how a rule is narrowed to one file through
\`source_filename\`. Write a rationale saying why the labels are right for everything
matching it, and check the standing rules before adding another.
`
