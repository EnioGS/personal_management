import { DEFAULT_INGESTION_GUIDE, INGESTION_GUIDE_KEY } from '@/lib/ingestion-guide'
import { DEFAULT_SYSTEM_PROMPT, SYSTEM_PROMPT_KEY } from '@/lib/assistant-prompts'
import { TOOL_GROUPS, toolRegistry } from '@/lib/tools/registry'
import { activeProfile } from './profiles'

export interface PromptEntry {
  key: string
  /** What this text is, for the person editing it. */
  label: string
  /** Which part of the conversation it belongs to, for grouping the editor. */
  section: 'Instructions' | 'Tools' | 'Tool sets'
  /** The wording in the code, which is what the Default profile says. */
  fallback: string
  /** Roughly how many tokens it costs when sent. */
  size: number
}

/**
 * Every word this app puts in front of the model, in one list.
 *
 * The two long documents, each tool's description, and the summary of each tool set —
 * that is the whole of it, because everything else the model reads is either the user's
 * own message or data. Gathering them here is what makes a profile possible: a profile is
 * this list with some entries said differently.
 *
 * Built rather than written down, so a tool added tomorrow is editable the same day and
 * nothing has to be kept in step by hand.
 */
export function promptRegistry(): PromptEntry[] {
  const entry = (key: string, label: string, section: PromptEntry['section'], fallback: string): PromptEntry =>
    ({ key, label, section, fallback, size: Math.round(fallback.length / 4) })

  return [
    entry(SYSTEM_PROMPT_KEY, 'System prompt', 'Instructions', DEFAULT_SYSTEM_PROMPT),
    entry(INGESTION_GUIDE_KEY, 'Ingestion guide', 'Instructions', DEFAULT_INGESTION_GUIDE),
    ...Object.entries(TOOL_GROUPS).map(([name, group]) => entry(`toolset.${name}`, name, 'Tool sets', group.summary)),
    ...toolRegistry.map((tool) => entry(`tool.${tool.name}`, tool.name, 'Tools', tool.description)),
  ].sort((left, right) => left.section.localeCompare(right.section) || left.label.localeCompare(right.label))
}

/**
 * What the model is told, under whichever profile is in force.
 *
 * The default is the code's own wording and is never stored, so a profile that says
 * nothing about a prompt gets the current wording rather than a copy of an old one.
 */
export function promptText(key: string, fallback: string): string {
  return activeProfile()?.overrides[key]?.trim() || fallback
}

/**
 * The placeholders a piece of text must keep, read from the text it replaces.
 *
 * Derived rather than declared: whatever the default writes as `[PLACEHOLDER_FOR_X]` is
 * what an edited version has to keep, so adding a placeholder to a default needs no list
 * updating anywhere.
 */
export function requiredPlaceholders(fallback: string): string[] {
  return [...new Set(fallback.match(/\[PLACEHOLDER_FOR_[A-Z0-9_]+\]/g) ?? [])]
}

export function brokenPlaceholders(entry: PromptEntry, text: string): string[] {
  return requiredPlaceholders(entry.fallback).filter((placeholder) => !text.includes(placeholder))
}

/**
 * Every prompt the active profile has broken, so a message can be refused before it is
 * sent rather than after it has been paid for.
 */
export function damagedPrompts(): { key: string; label: string; missing: string[] }[] {
  const profile = activeProfile()
  if (!profile) return []
  return promptRegistry()
    .filter((entry) => profile.overrides[entry.key])
    .map((entry) => ({ key: entry.key, label: entry.label, missing: brokenPlaceholders(entry, profile.overrides[entry.key]) }))
    .filter((entry) => entry.missing.length > 0)
}
