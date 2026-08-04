# Chat assistant as a global overlay, with a flat tool-calling registry

## Status

Accepted — builds on the shared vault decision (adr/0014) and the
prompts-not-translated decision (adr/0016).

## Context

The app needed a way to ask an LLM questions about the user's own data —
starting with attached files, then extended to reading/writing the
Finances and Investments tables — without introducing a backend (adr/0009)
or coupling the feature to any one section. Two separate design questions
came up: where the chat UI lives relative to the section registry, and how
the model gets more capability over time without every new capability
requiring changes to the request/response plumbing itself.

## Decision

**Global overlay, not a section.** The chat panel (`components/chat/`) is
mounted once at the app root, outside `AppSection`/`AppSectionItem` — it
stays available and keeps its state regardless of which section/item is
active, and switching sections never remounts or resets it. Its own
open/closed and unread state live in `store/chat-panel-store.ts`; message
history, attachments, and in-flight status live in `store/chat-store.ts`.

**OpenRouter, called directly from the browser.** `lib/openrouter.ts` is a
thin client for OpenRouter's OpenAI-compatible chat-completions endpoint,
using an API key the user supplies themselves (Settings → Assistant) —
consistent with adr/0009's no-backend stance; see that ADR's Consequences
for the privacy nuance this introduces (data the user actively sends to the
assistant leaves the device, opt-in only). Responses are capped
(`max_tokens`) rather than left to each model's own default, since that
default can be large enough that OpenRouter refuses the request outright
against a lower-balance API key. The available model list is a flat,
hand-edited JSON file (`lib/assistant-models.json`) grouped by provider in
the picker UI — not fetched from OpenRouter's own models endpoint, so it
stays exactly the set the user has chosen to try.

**Tool calling as a flat registry.** `lib/tools/registry.ts` holds an array
of `ToolDefinition`s (name, description, JSON-Schema parameters, an
`execute` that never throws — errors are returned as the tool's string
result, since a `role:"tool"` message always needs string content).
`lib/tools/run-conversation.ts` drives the request → tool-call → tool-result
loop against that registry (capped iterations, graceful handling of unknown
tool names and malformed argument JSON) and is deliberately kept out of
Zustand so it's unit-testable with a stubbed request function. Adding a
tool is one new `ToolDefinition` file plus one array entry — nothing else
in the loop, the request plumbing, or the UI needs to change.

`write_to_table`, and the later `read_table`/`update_table_rows`/
`delete_table_rows`/`restore_table_rows` tools (adr/0018), discover which
tables they may touch, and their column schemas, from
`lib/tools/writable-tables.ts` rather than hardcoding them — a future table
added to Finances/Investments needs one entry there to be picked up, both by
each tool's validation logic and by the description text sent to the model.
`write_to_table` writes immediately (no plan-then-confirm staging step) and
reports back per-row validation failures so partial success is visible; the
user reviews/edits/deletes afterward via the existing table UI, same as any
manual edit. Notes is intentionally excluded from writable tables.

## Consequences

New tools (and new writable tables) are additive — no changes to
`run-conversation.ts`, `chat-store.ts`, or the chat UI. The chat assistant
is the one deliberate exception to "no data leaves the device" (adr/0009),
scoped to exactly what the user attaches or asks it to read/write, and only
when they've configured an API key. Streaming was explicitly scoped out —
the assistant returns one response per turn, not incremental tokens; that
remains a candidate for later but adds real complexity (partial-message UI
state, cancellation) that wasn't justified for the current feature set.
