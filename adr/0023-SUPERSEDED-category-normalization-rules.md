# Category normalization: rules resolve at read time, never rewrite stored data

## Status

Superseded by adr/0031. Category rules, the resolver and the Categories
settings panel were removed: a row's category is now one of the labels assigned
in the Data ingestion centre, and naming a category there creates it. Read-time
resolution solved the wrong half of the problem — it normalised a raw string,
but it also let a row reach a dashboard without anyone deciding what the row
actually was.

## Context

A category column is an open vocabulary (typed values, CSV imports), which
means the same real-world category shows up spelled differently across
sources: "PIX", "Pix recebido", "PIX TRANSF JOAO" should all be one category,
but nothing forced that. The fix could not be "rewrite the raw value when it
arrives" — that is exactly the kind of silent, hard-to-reverse mutation
adr/0018 already ruled out for a different reason (the assistant's row
corrections), and it doesn't compose with rules added later: a rule for
"contains pix" written six months in should reclassify every past PIX entry
immediately, not just new ones.

## Decision

Category rules resolve raw values onto canonical categories at **read**
time (`lib/model/category-resolver.ts`); the stored row always keeps
whatever was actually typed or imported.

- A `CategoryRule` is `{ categoryId, match: equals|contains|startsWith|regex,
  pattern, caseSensitive?, priority, scope? }`. Rules run in priority order,
  first match wins — a narrow rule ("contains pix salario") can sit ahead of
  a broad one ("contains pix") without being swallowed by it.
- An unmatched value resolves to **itself**, never to a catch-all bucket —
  staying visible (and surfacing in Settings -> Categorias' "unclassified"
  worklist) instead of quietly disappearing into "Outros".
- A value spelled exactly like a category name (case-insensitively) resolves
  to it even with no rule at all. Without this, a category typed straight
  into a table — which auto-registers as a bare `Category`, see below —
  would sit in the unclassified worklist forever despite already displaying
  correctly, since nothing had written a rule for its own exact spelling.
- **Auto-registration** (`lib/model/ensure-categories.ts`): a new value
  committed anywhere (draft row or CSV import) that doesn't case-
  insensitively match an existing category creates one automatically — no
  rule, just the bare entity — so it is immediately visible in Settings and
  immediately offered as a suggestion in *every other* table's category
  column, not just the one it was typed into.
- Rules may be scoped to one `TableKind`, since the same raw text can mean
  different things in a bank statement vs. a card ledger; an unscoped rule
  applies everywhere.

## Consequences

Adding or editing a rule reclassifies all matching history at once, with
nothing to migrate and nothing lost if the rule is wrong or later removed.
The cost is one resolver pass over the category column of every visible
row (memoized per distinct raw string, so a table of thousands of rows
with a few dozen distinct categories is cheap) instead of a value that was
already correct at rest. Deleting a category cascades to the rules that
name it, so Settings -> Categorias doesn't accumulate rules pointing at
nothing — the resolver already tolerates that case (skips a rule whose
category no longer exists) for the moment between deleting a category and
its rules following it.
