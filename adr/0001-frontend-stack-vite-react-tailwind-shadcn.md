# Frontend stack: Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui

## Status

Accepted

## Context

This project needs a frontend stack that is quick to build with, widely
known, and matches a sober, neutral, VSCode-inspired visual language rather
than a heavily "branded" UI kit look. A significant share of the logic and
data handling is expected to live client-side (see the local-first storage
decision), which argues against frameworks built around server rendering.

## Decision

Use Vite + React + TypeScript for the build/runtime, Tailwind CSS v4 for
styling, and shadcn/ui for components. shadcn/ui's default neutral/grayscale
palette matches the sober visual goal, and it composes with
`react-resizable-panels` for the panel layout. Next.js was considered and
rejected: SSR/RSC add hydration and server/client boundary complexity that
buys nothing for an app meant to be mostly client-rendered.

## Consequences

Fast local dev loop (Vite HMR), a large ecosystem, and a component library
that needs no restyling to fit the "sober" brief. Tradeoff: no built-in
routing or SSR — added explicitly if/when needed (e.g. react-router), not
assumed upfront.
