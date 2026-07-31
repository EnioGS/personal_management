# Local-first, encrypted client storage: Dexie + Web Crypto + Zustand

## Status

Accepted

## Context

A meaningful part of this project's expected use involves logic and data
entry happening entirely in the browser, and some of that data may be
sensitive and only need to live on the user's machine, never touching a
backend. Rolling this pattern by hand for each new area (finances,
investments, ...) would be wasted, error-prone effort — encryption is easy
to get subtly wrong.

## Decision

Provide a reusable pattern: Dexie.js wraps IndexedDB for structured, async,
larger-than-localStorage persistence; Web Crypto (PBKDF2 → AES-GCM) encrypts
data at rest using a key derived from a user passphrase kept in memory only,
never persisted; Zustand holds the unlocked/locked state and wraps the async
Dexie calls. The "Notes" panel is the reference implementation of the full
loop: unlock → add → encrypted write → decrypted read-back.

## Consequences

Sensitive data never needs to reach a backend, and future sections get a
tested (see the testing decision) encryption pattern instead of rolling their
own. This protects data at rest (disk/backup snooping) but explicitly does
**not** protect against XSS — a page-level attacker can read whatever the app
can. Reason to keep dependencies lean and CSP strict for genuinely sensitive
data, not a reason to change the approach.
