import { ArrowLeftRight, LineChart, Receipt, Repeat, Wallet } from 'lucide-react'
import type { AppSection } from '../types'
import { InvestmentsPanel } from '../investments/investments-panels'
import { OverviewPanel, SpendingPanel } from './finances-panels'
import { RecurringPanel } from './recurring-panel'

export const financesSection: AppSection = {
  id: 'finances',
  labelKey: 'finances:section.label',
  icon: Wallet,
  items: [
    { id: 'overview', labelKey: 'finances:items.movements', icon: ArrowLeftRight, component: OverviewPanel },
    { id: 'spending', labelKey: 'finances:items.spending', icon: Receipt, component: SpendingPanel },
    { id: 'investments', labelKey: 'investments:section.label', icon: LineChart, component: InvestmentsPanel },
    { id: 'recurring', labelKey: 'finances:items.recurring', icon: Repeat, component: RecurringPanel },
  ],
}
