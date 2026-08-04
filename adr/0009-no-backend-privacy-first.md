# No backend by design — data stays private

## Status

Accepted

## Context

This app handles personal data (obligations, notes, finances, plans) that
should stay under the owner's control rather than pass through or be stored
by a third-party service. A conventional application backend would mean
either self-hosting a server with access to that data or trusting a hosted
provider with it — neither fits the goal of keeping data privately
restricted to the user's own machine, or a private cloud/storage solution
the user controls.

## Decision

No backend is designed or projected to exist, for now. Data lives
client-side (see the local-first encrypted storage decision) and, if remote
persistence is ever needed, it targets private, user-owned storage (e.g.
self-hosted, or a private cloud bucket) rather than a general-purpose
application backend. The `backend/` directory stays empty and the `backend`
service in `docker-compose.yml` stays commented out until (if ever) such a
target is chosen.

## Consequences

No server-side attack surface or third-party data custodian to trust. Any
future feature needing sync/remote storage must be designed against a
private storage target the user controls, not a conventional REST/GraphQL
backend. `docker-compose.yml` and CI stay frontend-only until that happens.

One deliberate, opt-in exception: the chat assistant (`lib/openrouter.ts`,
`lib/tools/`) calls OpenRouter directly from the browser using a key the
user supplies themselves — nothing is proxied through infrastructure this
project runs. It's still not a "backend" in the sense this ADR is about
(no server we operate, no data custodian we choose on the user's behalf),
but it is the one place data the user actively sends to the assistant
(messages, attached file contents, and any rows a tool call writes) leaves
the device, and only when the user has configured an API key and chosen to
use the feature.
