import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { CATEGORICAL_PALETTE, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { CsvExportButton } from '@/components/data-table/csv-export-button'
import { CsvImportDialog } from '@/components/data-table/csv-import-dialog'
import { EditableDataTable } from '@/components/data-table/editable-data-table'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { LockButton, UnlockGate } from '@/components/layout/unlock-gate'
import { bucketByMonth, formatDateLabel, formatMonthLabel, runningPositionOverTime } from '@/lib/aggregations'
import { getCurrentValue, type Transaction } from '@/lib/current-value'
import { contributionsSchema, useContributionsStore } from './contributions-store'
import { transactionSchema } from './transaction-schema'
import { useFixedIncomeStore } from './fixed-income-store'
import { useVariableIncomeStore } from './variable-income-store'

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function OverviewPanel() {
  return (
    <UnlockGate>
      <OverviewContent />
    </UnlockGate>
  )
}

function OverviewContent() {
  const { t } = useTranslation('investments')
  const { items: variableItems } = useVariableIncomeStore()
  const { items: fixedItems } = useFixedIncomeStore()

  const lineData = runningPositionOverTime([...variableItems, ...fixedItems])
  const variableTotal = allocationPieData(variableItems).reduce((sum, d) => sum + d.value, 0)
  const fixedTotal = allocationPieData(fixedItems).reduce((sum, d) => sum + d.value, 0)
  const pieData = [
    { key: 'variableIncome', label: t('items.variableIncome'), value: variableTotal, color: DOMAIN_COLOR.variableIncome },
    { key: 'fixedIncome', label: t('items.fixedIncome'), value: fixedTotal, color: DOMAIN_COLOR.fixedIncome },
  ].filter((slice) => slice.value > 0)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('items.overview')}</h2>
        <LockButton />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
        <AppLineChart
          data={lineData}
          xKey="date"
          xFormatter={formatDateLabel}
          series={[{ key: 'value', label: t('items.overview'), color: DOMAIN_COLOR.balance }]}
        />
        <AppPieChart data={pieData} />
      </div>
    </div>
  )
}

function allocationPieData(items: Transaction[]) {
  const assets = [...new Set(items.map((t) => t.asset))]
  return assets
    .map((asset, i) => ({
      key: asset,
      label: asset,
      value: getCurrentValue(asset, items),
      color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
    }))
    .filter((slice) => slice.value > 0)
}

function TransactionLedgerPanel({
  id,
  title,
  color,
  items,
  addItem,
  addItems,
  deleteItem,
}: {
  id: string
  title: string
  color: (typeof DOMAIN_COLOR)['variableIncome']
  items: (Transaction & { id: number; createdAt: number })[]
  addItem: (row: Transaction) => void
  addItems: (rows: Transaction[]) => void
  deleteItem: (id: number) => void
}) {
  const lineData = runningPositionOverTime(items)
  const pieData = allocationPieData(items)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 pb-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <LockButton />
      </div>
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id={id}
          chart={
            <div className="grid h-full grid-cols-2 gap-4 p-4">
              <AppLineChart
                data={lineData}
                xKey="date"
                xFormatter={formatDateLabel}
                series={[{ key: 'value', label: title, color }]}
              />
              <AppPieChart data={pieData} />
            </div>
          }
          table={
            <EditableDataTable
              schema={transactionSchema}
              rows={items}
              onAddRow={(row) => void addItem(row)}
              onDeleteRow={(rowId) => void deleteItem(rowId)}
              actions={
                <>
                  <CsvExportButton rows={items} schema={transactionSchema} filename={`${id}.csv`} />
                  <CsvImportDialog schema={transactionSchema} onImport={(rows) => void addItems(rows)} />
                </>
              }
            />
          }
        />
      </div>
    </div>
  )
}

export function VariableIncomePanel() {
  return (
    <UnlockGate>
      <VariableIncomeContent />
    </UnlockGate>
  )
}

function VariableIncomeContent() {
  const { t } = useTranslation('investments')
  const { items, addItem, addItems, deleteItem } = useVariableIncomeStore()
  return (
    <TransactionLedgerPanel
      id="variableIncome"
      title={t('items.variableIncome')}
      color={DOMAIN_COLOR.variableIncome}
      items={items}
      addItem={addItem}
      addItems={addItems}
      deleteItem={deleteItem}
    />
  )
}

export function FixedIncomePanel() {
  return (
    <UnlockGate>
      <FixedIncomeContent />
    </UnlockGate>
  )
}

function FixedIncomeContent() {
  const { t } = useTranslation('investments')
  const { items, addItem, addItems, deleteItem } = useFixedIncomeStore()
  return (
    <TransactionLedgerPanel
      id="fixedIncome"
      title={t('items.fixedIncome')}
      color={DOMAIN_COLOR.fixedIncome}
      items={items}
      addItem={addItem}
      addItems={addItems}
      deleteItem={deleteItem}
    />
  )
}

export function ContributionsPanel() {
  return (
    <UnlockGate>
      <ContributionsContent />
    </UnlockGate>
  )
}

function ContributionsContent() {
  const { t } = useTranslation('investments')
  const { items, addItem, addItems, deleteItem } = useContributionsStore()

  const barData = bucketByMonth(items, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))
  const total = items.reduce((sum, row) => sum + row.amount, 0)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 pb-0">
        <h2 className="text-sm font-medium">{t('items.contributions')}</h2>
        <LockButton />
      </div>
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id="contributions"
          chart={
            <div className="flex h-full flex-col gap-2 p-4">
              <p className="text-muted-foreground text-sm">
                {t('columns.total')}: <span className="text-foreground font-medium">{currency.format(total)}</span>
              </p>
              <div className="min-h-0 flex-1">
                <AppBarChart
                  data={barData}
                  xKey="month"
                  xFormatter={formatMonthLabel}
                  series={{ key: 'amount', label: t('items.contributions'), color: DOMAIN_COLOR.contributions }}
                />
              </div>
            </div>
          }
          table={
            <EditableDataTable
              schema={contributionsSchema}
              rows={items}
              onAddRow={(row) => void addItem(row)}
              onDeleteRow={(id) => void deleteItem(id)}
              actions={
                <>
                  <CsvExportButton rows={items} schema={contributionsSchema} filename="contributions.csv" />
                  <CsvImportDialog schema={contributionsSchema} onImport={(rows) => void addItems(rows)} />
                </>
              }
            />
          }
        />
      </div>
    </div>
  )
}
