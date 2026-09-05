# Assistant profiles: every wording under one name, measured

## Status

Accepted — extends adr/0027 (multi-provider connections) and the editable
prompts that came with it.

## Context

Two prompts were editable — the system prompt and the ingestion guide — and
everything else the model reads was fixed in code: every tool's description,
every tool set's summary. That is most of the words, and it is the half most
worth experimenting with, since a tool description is read on every request
while the guide is read once.

There was also no way to tell whether an experiment helped. Usage was one row
for the whole app, so a shorter wording and a longer one spent into the same
tally.

## Decision

**A profile is every prompt at once, under a name.** The system prompt, the
guide, each tool description, each tool set summary — gathered by
`promptRegistry()`, which is built from the code rather than written down, so a
tool added tomorrow is editable the same day.

**The default is not stored.** It is the wording in the code, and a profile
holds only what it says differently — so a profile written last month still
gets this month's improvements to everything it did not touch. Clearing a box
is how an experiment is abandoned.

**A profile carries its connection**, copied from what was selected when it was
made: provider, key and model. A wording is comparable with another only when
the model is the same, and interesting across models only when it can be pointed
at another — so the whole experiment lives under one name.

**Placeholders are `[PLACEHOLDER_FOR_X]`**, derived from the default text rather
than declared in a list: whatever the default writes is what an edited version
must keep. A prompt that has lost one turns its box red, and the next message is
refused before it is sent — the model would otherwise be told to use labels
without being told which exist.

**Usage is one tally per profile, per provider, per model**, summed back up in
whichever direction the question needs. A message is attributed to the profile
in force when it was sent, not when it came back, so switching mid-conversation
splits the cost honestly between them. The user's own bubble names the profile
it was written under, the way the reply names its model.

## Consequences

- Two rows in the settings table are the whole point: the same work, two
  wordings, and what each of them cost.
- A profile's overrides are stored verbatim, so a tool renamed in code orphans
  its override. The registry is keyed by tool name; an orphan is inert rather
  than harmful, and shows as an entry the editor no longer lists.
- Editing connections in Settings still edits the app's own list. A profile's
  connection is a copy taken at creation, and only its model is editable
  afterwards — enough to compare wordings across models, short of a full
  per-profile connection manager.
