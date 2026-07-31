import { Banknote, LayoutDashboard, Receipt, Wallet } from 'lucide-react'
import type { AppSection } from '../types'
import { IncomePanel, OverviewPanel, SpendingPanel } from './finances-panels'

export const financesSection: AppSection = {
  id: 'finances',
  labelKey: 'finances:section.label',
  icon: Wallet,
  items: [
    { id: 'overview', labelKey: 'finances:items.overview', icon: LayoutDashboard, component: OverviewPanel },
    { id: 'spending', labelKey: 'finances:items.spending', icon: Receipt, component: SpendingPanel },
    { id: 'income', labelKey: 'finances:items.income', icon: Banknote, component: IncomePanel },
  ],
}
