# Two-level, VSCode-style navigation as a data-driven registry

## Status

Accepted — supersedes an initial implementation built on shadcn/ui's
`Sidebar`.

## Context

The template's UI paradigm needed to be an icon-only "activity bar" that
selects a section, driving a labeled "secondary bar" of items within that
section, which in turn determines the main content — matching VSCode's
structure. The initial implementation used shadcn/ui's `Sidebar` component,
which turned out to be built for one collapsible region, not two
independent, always-visible bars with different behavior.

## Decision

Drop shadcn/ui's `Sidebar` and build two purpose-built components
(`ActivityBar`, `SecondaryBar`) driven by a data-driven "sections" registry
(`src/sections/`). Each section is a self-contained folder with its own
definition, components, and (as of the i18n decision) translations. Adding a
feature means adding a new folder plus one line in `src/sections/index.ts` —
not touching shared layout code.

## Consequences

The navigation shell is a thin renderer over data rather than hand-wired UI,
making it straightforward to extend. Cost: more code than reusing a
pre-built sidebar component would have been, and that code (`ui-store.ts` in
particular) is exactly what's covered by the testing decision, since a
regression there breaks navigation everywhere.
