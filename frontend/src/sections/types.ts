import type { LucideIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import type { TableKind } from '@/lib/model/types'

export interface AppSectionItem {
  id: string
  /** i18next key, "namespace:key" form, e.g. "notes:items.allNotes". */
  labelKey: string
  icon: LucideIcon
  component: ComponentType
  /**
   * Which kinds of table this screen reads. Declared here so anything that has to
   * present the user's tables — the ingestion centre's per-table view, above all —
   * can group them the way the app is navigated, instead of keeping its own map of
   * which screen shows what.
   */
  tableKinds?: TableKind[]
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
}
