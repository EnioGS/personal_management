import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'

export interface AppSectionItem {
  id: string
  /** i18next key, "namespace:key" form, e.g. "notes:items.allNotes". */
  labelKey: string
  icon: LucideIcon
  component: ComponentType
}

/** A primary activity-bar entry. `items` must be non-empty. */
export interface AppSection {
  id: string
  /** i18next key, "namespace:key" form, e.g. "notes:section.label". */
  labelKey: string
  icon: LucideIcon
  items: AppSectionItem[]
  /** Rendered at the bottom of the activity bar, visually separated (e.g. Settings). */
  pinned?: boolean
  /** Rendered as a colored logo-style box instead of a plain icon (see activity-bar.tsx). */
  brand?: boolean
  /**
   * True when this section's screens hold confirmed rows.
   *
   * Only these are labelling vocabulary and only these have tables: Notes, Vault and
   * Settings are places to work, not places rows go, and offering them as labels would
   * mean a row could be confirmed into a table nothing will ever read.
   */
  holdsData?: boolean
}
