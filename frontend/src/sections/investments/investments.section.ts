import { Landmark, LayoutDashboard, LineChart, PiggyBank, TrendingUp } from 'lucide-react'
import type { AppSection } from '../types'
import { ContributionsPanel, FixedIncomePanel, OverviewPanel, VariableIncomePanel } from './investments-panels'

export const investmentsSection: AppSection = {
  id: 'investments',
  labelKey: 'investments:section.label',
  icon: LineChart,
  items: [
    { id: 'overview', labelKey: 'investments:items.overview', icon: LayoutDashboard, component: OverviewPanel },
    {
      id: 'variableIncome',
      labelKey: 'investments:items.variableIncome',
      icon: TrendingUp,
      component: VariableIncomePanel,
    },
    {
      id: 'fixedIncome',
      labelKey: 'investments:items.fixedIncome',
      icon: Landmark,
      component: FixedIncomePanel,
    },
    {
      id: 'contributions',
      labelKey: 'investments:items.contributions',
      icon: PiggyBank,
      component: ContributionsPanel,
    },
  ],
}
