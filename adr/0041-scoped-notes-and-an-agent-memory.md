# Scoped notes, and a memory the assistant keeps itself

## Status

Accepted.

## Context

Classification notes were free text with nothing saying what they were about. A
note reading "sells food, not leisure" is true of one merchant on one card in
one section, but it arrived with every request regardless, and the assistant had
to guess how far it reached. Notes about a single file competed with notes that
held everywhere.

Separately, the assistant had nowhere to put what it learned. Everything it
worked out — which rows it could not label and what was missing, what a user's
explanation unlocked — lived only in a conversation, and was gone when that
conversation was. The next conversation asked the same questions.

## Decision

Both problems take the same shape, so they take the same solution.

Every note and every memory entry carries a **scope** of eight fields: account,
card, section, screen, class, category, subcategory, and `lines` for which rows
inside a table. Each field is a few words or the literal word `global`. A blank
is refused — by the tools and by the panel — because a blank says nobody has
decided, which is not the same as saying it applies everywhere. Fields narrow
independently, so one class with everything else `global` is a statement about
that class in every table. Rendering omits the `global` fields: repeating the
word eight times says nothing.

**Agent memory** is a second store of the same shape, in its own Dexie table
(`agentMemory`, model-db v17), with its own section in the Data ingestion centre
and its own toolset (`read_agent_memory`, `add`, `edit`, `delete`). It is *not*
appended to the guide. The guide says it exists and the assistant reads it when
it needs it — a working log grows, and sending all of it on every request would
cost more than it saves. Deletion is guarded by `confirmed: true`, like the
other destructive tools the assistant can reach; editing is how an entry shrinks
as the user explains its rows.

The assistant is told to write there tersely and hierarchically: what the user
explained that will matter again, what it could not label and exactly what was
missing, and — its own entry — what it could label once explained. As
explanations arrive the second shrinks and the third grows.

## Consequences

A note now says what it governs, so a note about one file stops reading as a
rule about everything. The assistant stops re-asking what it has already been
told, at the cost of one tool call in the conversations where that matters.

Whether that hierarchy is the right one is not yet known — it was specified
before we watched it used. AGENTS.md carries a temporary section asking for it
to be revisited, and instructing its own deletion once it has been.

## Amendment: memory is not split by stage

The first implementation gave memory the same `source`/`confirmed` split as
notes, in the read tool and in the panel. That split is right for notes — they
are appended to the guide per stage — and wrong for memory. Watching it used,
the assistant wrote an entry while a file was open, read the memory later from a
confirmed table, was handed an empty list, and wrote the same entry a second
time; then deleted one of the two, and could not say which.

Memory is now read whole. `context` is still stored, saying where the entry came
up, and never filters. `add_agent_memory` additionally refuses a title already
in use, naming the entry to rewrite instead — one subject, one entry.

## Amendment: the scope organises the memory, not a hierarchy

The original instruction asked for entries filed under three headings: what the
user explained, what could not be labelled and why, and what could be labelled
once explained. That was specified before we had watched it used, and it did not
survive contact. Asked to remember four merchants, the assistant made one entry
called "Reference facts — confirmed finance data" and put everything in it —
including a wholesale copy of a classification note, so the same facts then lived
in two places with no rule saying which won.

The reason is visible in the shape of the request: filing a fact under one of
three headings means deciding what kind of fact it is before deciding what it is
about, and a fact about a merchant is all three at once depending on when you
ask. So it made one pile. The scope, meanwhile, was used correctly throughout.

The heading hierarchy is dropped. The rule is now **one entry per scope**,
enforced: `add_agent_memory` refuses a scope, or a title, that an existing entry
already holds, and names the entry to rewrite instead. What organises the memory
is what a thing is about, which the assistant was already getting right.
