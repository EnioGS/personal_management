import { useTranslation } from 'react-i18next'
import { AppPieChart } from '@/components/charts/pie-chart'
import { colorForKey, MAX_CATEGORICAL_SERIES } from '@/components/charts/chart-colors'
import { foldTopCategories } from '@/lib/aggregations'
import { computePositions, type Transaction } from '@/lib/current-value'
import { useEntriesOfKinds } from '@/lib/model/use-model-data'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const number = new Intl.NumberFormat('pt-BR')

/**
 * Current holdings across every investment ledger table at once — a position is a
 * portfolio-wide idea, not something scoped to whichever one table happens to be
 * selected (unlike the leaf ledger panels, which are legitimately per-table).
 */
export function PositionsPanel() {
  const { t } = useTranslation(['investments', 'common'])
  const rows = useEntriesOfKinds(['investmentLedger'])
  const transactions = rows as unknown as Transaction[]
  const positions = computePositions(transactions)
  const totalValue = positions.reduce((sum, p) => sum + p.currentValue, 0)

  const pieData = foldTopCategories(
    positions.map((p) => ({ label: p.asset, value: p.currentValue })),
    MAX_CATEGORICAL_SERIES,
    t('common:chart.other'),
  ).map((d) => ({ key: d.label, label: d.label, value: d.value, color: colorForKey(d.label) }))

  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div>
        <h2 className="text-sm font-medium">{t('items.positions')}</h2>
        <p className="text-muted-foreground text-xs">{t('positions.description')}</p>
      </div>

      {positions.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('positions.noPositions')}</p>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
          <div className="flex flex-col overflow-auto rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="p-2 text-left font-medium">{t('common:columns.asset')}</th>
                  <th className="p-2 text-right font-medium">{t('common:columns.quantity')}</th>
                  <th className="p-2 text-right font-medium">{t('positions.averagePrice')}</th>
                  <th className="p-2 text-right font-medium">{t('positions.currentValue')}</th>
                  <th className="p-2 text-right font-medium">{t('positions.shareOfPortfolio')}</th>
                </tr>
              </thead>
              <tbody>
                {positions
                  .slice()
                  .sort((a, b) => b.currentValue - a.currentValue)
                  .map((p) => (
                    <tr key={p.asset} className="border-b last:border-0">
                      <td className="p-2">{p.asset}</td>
                      <td className="p-2 text-right tabular-nums">{number.format(p.quantity)}</td>
                      <td className="p-2 text-right tabular-nums">{currency.format(p.averagePrice)}</td>
                      <td className="p-2 text-right tabular-nums">{currency.format(p.currentValue)}</td>
                      <td className="p-2 text-right tabular-nums">
                        {totalValue > 0 ? `${((p.currentValue / totalValue) * 100).toFixed(1)}%` : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <AppPieChart data={pieData} />
        </div>
      )}
    </div>
  )
}
