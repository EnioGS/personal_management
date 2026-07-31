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
}
