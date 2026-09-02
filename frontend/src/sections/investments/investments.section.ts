import { Landmark, LayoutDashboard, LineChart, PieChart, PiggyBank, Sparkles, TrendingUp, Wallet } from 'lucide-react'
import type { AppSection } from '../types'
import { AllocationPanel } from './allocation-panel'
import {
  ContributionsPanel,
  DividendsPanel,
  FixedIncomePanel,
  OverviewPanel,
  VariableIncomePanel,
} from './investments-panels'
import { PositionsPanel } from './positions-panel'

export const investmentsSection: AppSection = {
  id: 'investments',
  labelKey: 'investments:section.label',
  icon: LineChart,
  items: [
    { id: 'overview', labelKey: 'investments:items.overview', icon: LayoutDashboard, component: OverviewPanel },
    { id: 'positions', labelKey: 'investments:items.positions', icon: Wallet, component: PositionsPanel },
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
    { id: 'dividends', labelKey: 'investments:items.dividends', icon: Sparkles, component: DividendsPanel },
    { id: 'allocation', labelKey: 'investments:items.allocation', icon: PieChart, component: AllocationPanel },
  ],
}
