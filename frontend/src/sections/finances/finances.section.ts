import { ArrowLeftRight, CreditCard, LayoutDashboard, Receipt, Wallet } from 'lucide-react'
import type { AppSection } from '../types'
import { CardsPanel, MovementsPanel, OverviewPanel, SpendingPanel } from './finances-panels'

export const financesSection: AppSection = {
  id: 'finances',
  labelKey: 'finances:section.label',
  icon: Wallet,
  items: [
    { id: 'overview', labelKey: 'finances:items.overview', icon: LayoutDashboard, component: OverviewPanel },
    { id: 'movements', labelKey: 'finances:items.movements', icon: ArrowLeftRight, component: MovementsPanel },
    { id: 'spending', labelKey: 'finances:items.spending', icon: Receipt, component: SpendingPanel },
    { id: 'cards', labelKey: 'finances:items.cards', icon: CreditCard, component: CardsPanel },
  ],
}
