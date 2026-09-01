/**
 * Which section the app opens on. Lives apart from `sections/index.ts` because that
 * module pulls in every panel component, and the UI store — which needs this default —
 * must not sit downstream of the panels: the panels read the store, so importing the
 * registry there closes a cycle that leaves `sections` undefined at module init.
 *
 * Kept honest by a test asserting it matches the first registered section.
 */
export const DEFAULT_SECTION_ID = 'vault'
