import { Bot, DatabaseZap, Settings, SlidersHorizontal } from 'lucide-react'
import type { AppSection } from '../types'
import { AssistantPanel } from './assistant-panel'
import { GeneralPanel } from './general-panel'
import { IngestionPanel } from './ingestion-panel'

export const settingsSection: AppSection = {
  id: 'settings',
  labelKey: 'settings:section.label',
  icon: Settings,
  pinned: true,
  items: [
    { id: 'general', labelKey: 'settings:items.general', icon: SlidersHorizontal, component: GeneralPanel },
    { id: 'assistant', labelKey: 'settings:items.assistant', icon: Bot, component: AssistantPanel },
    { id: 'ingestion', labelKey: 'settings:items.ingestion', icon: DatabaseZap, component: IngestionPanel },
  ],
}
