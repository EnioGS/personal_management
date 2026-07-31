# Assistant prompts are not translated (en/pt)

## Status

Accepted

## Context

Every other user-facing string in the app goes through the i18next
namespace-per-section pattern (adr/0003), rendered in whichever of en/pt the
user has selected. The assistant's system prompt (and any per-feature
prompts added later) is different in kind: it isn't UI copy a person reads —
it's an instruction sent to the model, and the model's behavior is what the
translation would actually affect, not a screen the user is looking at.
Running it through the locale system would mean either maintaining two
parallel prompt variants that could drift in meaning, or auto-translating
instructions to an LLM through the same static-JSON mechanism built for
button labels — neither is what that mechanism is for.

## Decision

Assistant prompts are stored as plain data (`lib/assistant-prompts.ts`,
persisted as a vault table like any other user data — see
adr/0014/adr/0015) rather than as i18next resource keys. They are not
translated: whatever language the user writes or edits a prompt in is the
language it stays in and the language sent to the model, regardless of the
app's current UI locale (`settings:general.languageLabel`). The default
system prompt ships in English.

## Consequences

One fewer thing to keep in sync across `en.json`/`pt.json`, and the model
always receives exactly the instruction text the user wrote, with the
system never silently rewriting it. Consequence worth naming: a
Portuguese-speaking user gets an English default prompt on first use (until
they edit it in Settings → Assistant) — a deliberate one-time rough edge,
not an oversight, since translating only the *default* while leaving
user-edited prompts untranslated would be an inconsistent half-measure.
