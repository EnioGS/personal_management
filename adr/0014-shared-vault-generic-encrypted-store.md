# Shared vault unlock + generic encrypted-store factory

## Status

Accepted — builds on the local-first encrypted storage decision.

## Context

The local-first encrypted storage decision established the pattern (Dexie +
Web Crypto + Zustand) with Notes as the one reference implementation, on the
assumption future sections would follow the same shape. Once Finances and
Investments actually needed it — five more encrypted tables across two
sections — two problems showed up: hand-copying Notes' crypto/CRUD code per
table would duplicate the exact logic the original decision was trying to
avoid rolling twice, and each section having its own independent passphrase
prompt (Notes asks once, Finances asks again, Investments asks again) is
real day-to-day friction with no corresponding security benefit — it's all
the same person's local data under the same threat model (adr/0002's "disk/
backup snooping," not "an attacker already on the device").

## Decision

Two changes, both generalizing rather than replacing the original pattern:

1. **Generic factories**, not per-section crypto: `lib/crypto/envelope.ts`
   holds the PBKDF2 → AES-GCM primitives; `lib/secure-store/` provides
   `createEncryptedTable<T>(table)` (CRUD + bulk operations against any Dexie
   table sharing the `{id, createdAt, salt, iv, ciphertext}` envelope shape)
   and `createEncryptedListStore<T>(table)` (the Zustand store shape Notes
   originally hand-wrote). Notes was migrated onto both, proving the
   generalization is behavior-preserving via its existing test suite.
2. **One shared vault**, not one per section: `store/vault-store.ts` holds a
   single in-memory `passphrase`, never persisted. `createEncryptedListStore`
   subscribes to it internally and auto-refreshes when it changes, so
   unlocking once unlocks Notes, Finances, and Investments together. Each
   Dexie *database* stays scoped to its own section folder regardless (e.g.
   `finances-spending-db`, `investments-contributions-db`) — only the
   passphrase is shared, not the storage.

## Consequences

Adding a new encrypted section is now "declare a Dexie table, call two
factories" instead of hand-writing crypto/CRUD/store code a third time.
Unlocking is a single action across the whole app rather than a repeated
prompt per section — the intended trade recommended in `2.` was decided in
favor of convenience specifically because the compartmentalization it gives
up (a leaked passphrase for one section not exposing others) doesn't apply
here: there's only one person's data, one passphrase, one machine. Cost: a
wrong passphrase now silently "unlocks" everything into an empty-looking
state everywhere at once, rather than in just one section, same fail-closed
behavior as before just at a larger blast radius — worth revisiting with an
explicit passphrase-verification step somewhere in the unlock flow.
