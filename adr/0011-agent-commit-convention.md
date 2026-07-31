# Agent commit convention: no AI attribution

## Status

Accepted

## Context

When AI coding agents work in this repo, their commits should read the same
as ones the repo owner made directly — no "Co-Authored-By" or other
agent-attribution text in commit messages.

## Decision

`AGENTS.md` and `CLAUDE.md` (both gitignored, local-only, never pushed)
instruct any coding agent to commit as the repo owner, with no mention of
agent involvement, and to check whether `README.md` needs updating before
any push.

## Consequences

Git history reads as if written entirely by the owner. Because these
instruction files are gitignored, a fresh clone of this repo won't have them
by default — they'd need to be recreated.
