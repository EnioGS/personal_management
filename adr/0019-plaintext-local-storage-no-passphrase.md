# Plaintext browser-local storage, no passphrase

## Status

Accepted — supersedes adr/0002 (local-first encrypted storage), adr/0014
(shared vault unlock + generic encrypted-store factory) and adr/0015
(whole-vault export/import as one encrypted file).

## Context

Encryption at rest (adr/0002/0014) bought one thing: data on disk being
unreadable without the passphrase. It cost a passphrase prompt standing
between the user and their own data on every single page load — the app
opened on a form, not on the data, and every section rendered an "unlock
your vault" placeholder until that form was filled in. Typing an 8–16
character passphrase to read your own spending chart, on your own machine,
several times a day, is friction the threat model never justified: adr/0014
already conceded this is one person's data on one machine, and adr/0002
already conceded the encryption does not protect against the realistic
browser-side attack (XSS reading whatever the app can read). What was left
was protection against someone with the disk — for which full-disk
encryption is the right layer, not the app.

The failure modes compounded it: a typo'd passphrase silently "unlocked"
into an empty-looking app (fail-closed, blast radius the whole vault), and
losing the passphrase meant losing every record with no recovery path.

## Decision

Drop encryption entirely and store rows as plain JSON in IndexedDB.

- `lib/local-store/` replaces `lib/secure-store/`: `createLocalTable<T>` and
  `createLocalListStore<T>` keep the same CRUD/store shape against a
  `{id, createdAt, data}` row. `lib/crypto/envelope.ts`,
  `store/vault-store.ts` and `components/layout/unlock-gate.tsx` are gone.
- **Every store loads itself on import.** With nothing to wait for, whatever
  is in the browser is on screen at first render — no unlock, no "Continue",
  no gate component wrapping panels.
- Each Dexie database gets a **v2 upgrade that clears its table**: rows in
  the old envelope shape are unreadable now that no passphrase exists, so
  they are dropped rather than surfaced as empty records.
- Export/import survive as the way to move data between machines, now as
  plain JSON (`lib/data-file.ts`, `.pmdata`, `version: 2`). Old encrypted
  `.pmvault` files (`version: 1`) are rejected on import — they cannot be
  read without the passphrase that no longer exists anywhere in the app.
- The brand-mark section's first item is no longer "Get Started" (a login
  form) but **Data**: a management screen showing what is stored in this
  browser, an Export card, an Import card, and a separate clear-everything
  action set apart from the two.

## Consequences

The app opens straight into the user's data. Adding a section is still
"declare a Dexie table, call the factory", minus the crypto. Anyone with
access to the browser profile (or the exported file) can read the data —
that is the accepted trade, and it puts the app in line with adr/0009's
actual guarantee, which was always "no backend / no third party", not
"encrypted at rest". Users upgrading from an encrypted vault lose the stored
rows on first load (the v2 upgrade drops them); there is no migration path,
because migrating would require the passphrase the app no longer collects.
