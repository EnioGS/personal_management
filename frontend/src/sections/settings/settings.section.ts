import { Bot, DatabaseZap, Landmark, Palette, Settings, SlidersHorizontal, Table2, Tags } from 'lucide-react'
import type { AppSection } from '../types'
import { AccountsCardsPanel } from './accounts-cards-panel'
import { AppearancePanel } from './appearance-panel'
import { AssistantPanel } from './assistant-panel'
import { CategoriesPanel } from './categories-panel'
import { GeneralPanel } from './general-panel'
import { IngestionPanel } from './ingestion-panel'
import { TablesPanel } from './tables-panel'

export const settingsSection: AppSection = {
  id: 'settings',
  labelKey: 'settings:section.label',
  icon: Settings,
  pinned: true,
  items: [
    { id: 'general', labelKey: 'settings:items.general', icon: SlidersHorizontal, component: GeneralPanel },
    { id: 'appearance', labelKey: 'settings:items.appearance', icon: Palette, component: AppearancePanel },
    { id: 'assistant', labelKey: 'settings:items.assistant', icon: Bot, component: AssistantPanel },
    { id: 'accountsCards', labelKey: 'settings:items.accountsCards', icon: Landmark, component: AccountsCardsPanel },
    { id: 'categories', labelKey: 'settings:items.categories', icon: Tags, component: CategoriesPanel },
    { id: 'ingestion', labelKey: 'settings:items.ingestion', icon: DatabaseZap, component: IngestionPanel },
    { id: 'tables', labelKey: 'settings:items.tables', icon: Table2, component: TablesPanel },
  ],
}
