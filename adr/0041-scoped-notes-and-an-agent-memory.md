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

## Amendment: a scope has to name something, and an entry has a ceiling

The first memory written under the rule above scoped itself `section: finances,
screen: confirmed finance data` and everything else `global`, and grew to four
thousand characters covering merchants, counterparties, withholding tax,
investment accounts and a dated caveat. "One entry per scope" had produced one
entry, because everything had been given the same scope — and `confirmed finance
data` is not a screen, so nothing could be looked up by it either.

Three things were missing, all of them enforcement rather than instruction:

- **The scope must name things that exist.** `section`, `screen`, `account` and
  `card` are checked against the label catalogue, and a wrong one is refused with
  the list of what there is. `class`, `category`, `subcategory` and `lines` stay
  free text, which is what they are elsewhere.
- **A scope of all `global` is refused.** A scope that narrows nothing says
  nothing about what the entry is about, and it is what turns one entry into the
  place everything goes.
- **An entry is capped at 1200 characters**, with a refusal that says to split it
  by scope. Without a ceiling, "one entry per scope" is satisfied by
  concatenation, which is what happened.

Separately, nothing brought the assistant back to memory at the moment it learned
something. It relabelled sixteen rows from a long explanation and wrote none of
it down. `label_rows_by_match` and `revise_confirmed_rows` now say, in their own
descriptions, to write down what made the labelling possible — those are the
tools in hand when the learning happens, and the guide is read before it.

## Amendment: the instruction has to be where it is always read

The tools were right and nothing reached the assistant at the moment it
mattered. Memory lived in the ingestion guide and in its own tool descriptions,
which are read only once work is already under way and the memory toolset is
already open — so a conversation that explained thirty merchants and relabelled
sixteen rows wrote nothing down, and none of it survived.

A short paragraph now sits in the system prompt, which is sent with every
request: keep your own record unasked, write before answering, read it back
before asking something already answered. That raises the system prompt's own
budget from 360 tokens to 440, deliberately. Everything else in that prompt can
be fetched on demand, because something in the prompt says to fetch it. This one
cannot: a model that does not know it keeps a record has no reason to read the
document that would have told it.

The paragraph is also appended to prompts saved before it existed, since the
alternative is a vault whose assistant silently never learns anything. Alongside
it: `open_toolset` says to open memory the moment the user explains something,
`add_classification_note` says that the user's notes are not the assistant's
record and copying one into the other leaves the same fact in two places, and
the guide says to read memory before labelling and write as work goes.

## Amendment: a title names its subject

Splitting by scope makes many entries, and a list of many entries is read by
its titles. The first one titled itself "Reference facts — confirmed finance
data", which says what kind of entry it is and nothing about what is in it; a
list titled that way has to be read in full to be searched.

`add_agent_memory` and `edit_agent_memory` now say what a title is for — the
subject first, then what is said about it, specific enough that no two entries
could share one — and refuse a title that names only the kind of entry
("reference facts", "notes", "misc", "confirmed finance data").

## Amendment: it tidies what it finds, unasked

Every guard above stops a bad entry being written. None of them touches the ones
already stored — and a vault in use has those, written before the guards
existed. An assistant reading a wall of undifferentiated text has no reason to
think anything is wrong with it.

So `read_agent_memory` says what is wrong. It returns the entries and, alongside
them, whichever of them holds several subjects at once, is titled after no
subject, or is scoped to everything — each by id, with what to do: add the
entries it should have been, one subject each, then delete the one it was, and
say in a line what was reorganised. The system prompt carries the same duty in
five words, since that is the text always read: *put right what you find
disordered*.

This is the same reasoning as the rest of this record. An instruction the
assistant reads once and a state it can see are not the same thing; the state
has to be handed to it at the moment it is holding the tool.

## Amendment: reorganising is not deleting

Told to tidy the memory, the assistant read the one disordered entry, wrote the
entries it should have been, and deleted the original. That is the right shape,
and it is also the shape in which everything is lost if the reading was partial:
nothing checks that what went in matches what came out, and the original is gone.

`delete_agent_memory` now takes `carriedBy` — the ids of the entries that hold
what this one held. They must already exist; an id for an entry not yet written
is refused, which forces write-then-check-then-delete rather than the reverse.
An entry nothing carries can still go, but only with a `reason` saying why
nothing is lost. And the result hands back the deleted title and text in full,
with a line telling the assistant to read the carrying entries and write down
anything that did not survive the move — so the content is still in the
conversation that removed it, recoverable by rewriting, and visible to the user
in the transcript. The journal already made it undoable; this makes it legible.
