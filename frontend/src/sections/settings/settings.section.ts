import { Palette, Settings, SlidersHorizontal } from 'lucide-react'
import type { AppSection } from '../types'
import { AppearancePanel } from './appearance-panel'
import { GeneralPanel } from './general-panel'

export const settingsSection: AppSection = {
  id: 'settings',
  labelKey: 'settings:section.label',
  icon: Settings,
  pinned: true,
  items: [
    { id: 'general', labelKey: 'settings:items.general', icon: SlidersHorizontal, component: GeneralPanel },
    { id: 'appearance', labelKey: 'settings:items.appearance', icon: Palette, component: AppearancePanel },
  ],
}
