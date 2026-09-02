import type { InvestmentClass } from './types'

/**
 * Tags investment tables created before `investmentClass` existed. Legacy tables had
 * Portuguese names fixed by the old UI, so "Renda Fixa" is unambiguous; custom,
 * unlabelled investment tables retain the old Variable Income placement rather than
 * disappearing from both workspaces.
 */
export function inferInvestmentClass(name: unknown): InvestmentClass {
  const normalized = String(name ?? '').trim().toLocaleLowerCase('pt-BR')
  return /renda\s*fixa|fixed|\b(cdb|lci|lca|cri|cra|tesouro|deb[êe]nture)\b/.test(normalized)
    ? 'fixedIncome'
    : 'variableIncome'
}
