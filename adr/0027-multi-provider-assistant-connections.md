# Multiple assistant connections, provider-detected from the key itself

## Status

Accepted.

## Context

The assistant was wired to exactly one provider (OpenRouter) through a
singleton config row (`key: 'default'`). Direct OpenAI access was requested
as a second option, and the Settings → Assistant screen needed to stop
asking for an explicit Save: a pasted key or an edited system prompt should
already be saved, the same auto-commit philosophy the editable tables use
elsewhere in the app.

## Decision

**One `AssistantConfig` row per provider**, not per app. The `key: 'default'`
singleton becomes `{ provider, apiKey, model, isActive }`, found by
`provider` rather than a fixed key — Dexie's list store already supported
multiple rows, only the lookup was singleton-shaped. A pre-existing row
(necessarily OpenRouter, the only provider that existed before) is
backfilled with `provider: 'openrouter', isActive: true` by a `db.version(3)`
upgrade rather than cleared, so an already-saved key survives the change.

**Provider detected from the key's own prefix**, client-side, no network
call: `sk-or-...` is OpenRouter, any other `sk-...` is OpenAI
(`lib/ai-providers.ts`). OpenRouter's prefix is checked first since it is
itself `sk-`-prefixed. A key matching neither shows inline red text in the
add-connection form instead of being saved.

**Connecting is the only save action.** The Connections list has no per-row
Save — a connection's model picker auto-saves on change, and the "Conectar"
button is what commits a newly pasted key (paired with a confirm dialog if
that provider already has a saved connection — always, regardless of
whether the new key differs from the old one). The system prompt textarea
persists on blur instead of a Save button, plus a reset button next to it
that writes `DEFAULT_SYSTEM_PROMPT` back in, for a user who doesn't want to
hand-edit it themselves.

**Exactly one connection is active at a time** (`isActive`), since a single
chat conversation needs one apiKey+model pair to call. Adding or replacing a
connection makes it the active one; other connections get a "Usar" button to
switch back. Nothing in the request specified this selection UI — it's the
simplest thing that lets more than one provider be configured without the
chat needing to guess.

**Request dispatch stays a caller-side choice, not `runConversation`'s
concern**: `lib/openai-client.ts` mirrors `lib/openrouter.ts`'s
`requestChatMessage` signature exactly (both speak the same
OpenAI-compatible chat-completions wire format OpenRouter was already
using), so `chat-store.ts` just picks which function to pass as
`runConversation`'s existing `requestFn` override based on the active
connection's provider — no signature change to the conversation loop itself.

**Model lists are filtered, not transformed, per provider.** OpenRouter
keeps the full `assistant-models.json` catalog under its own
vendor-namespaced ids (e.g. `openai/gpt-5.5`). A direct OpenAI connection
can only run OpenAI's own models, so its list is the `"OpenAI"`-labeled
subset with the `openai/` prefix stripped — that stripped id is also the
literal value stored and sent to OpenAI's API, so no id transform is needed
at request time.

## Consequences

Adding a third provider later means: one prefix check in
`detectApiProvider`, one thin client mirroring `openai-client.ts`'s shape,
and one dispatch branch in `chat-store.ts` — the connection list, replace
-confirm, and auto-save UI in `assistant-panel.tsx` need no changes since
they're already provider-generic. The export file needs no schema change:
`data-file.ts` serializes `assistantConfig` rows as opaque JSON already, so
the shape change travels for free.
