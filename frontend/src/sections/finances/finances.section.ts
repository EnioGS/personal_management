import { ArrowLeftRight, CreditCard, LayoutDashboard, PiggyBank, Receipt, Repeat, Wallet } from 'lucide-react'
import type { AppSection } from '../types'
import { BudgetPanel } from './budget-panel'
import { CardsPanel, MovementsPanel, OverviewPanel, SpendingPanel } from './finances-panels'
import { RecurringPanel } from './recurring-panel'

export const financesSection: AppSection = {
  id: 'finances',
  labelKey: 'finances:section.label',
  icon: Wallet,
  items: [
    { id: 'overview', labelKey: 'finances:items.overview', icon: LayoutDashboard, component: OverviewPanel },
    { id: 'movements', labelKey: 'finances:items.movements', icon: ArrowLeftRight, component: MovementsPanel },
    { id: 'spending', labelKey: 'finances:items.spending', icon: Receipt, component: SpendingPanel },
    { id: 'cards', labelKey: 'finances:items.cards', icon: CreditCard, component: CardsPanel },
    { id: 'budget', labelKey: 'finances:items.budget', icon: PiggyBank, component: BudgetPanel },
    { id: 'recurring', labelKey: 'finances:items.recurring', icon: Repeat, component: RecurringPanel },
  ],
}
