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
