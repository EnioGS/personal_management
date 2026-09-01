import { useTranslation } from 'react-i18next'
import { AppBarChart } from '@/components/charts/bar-chart'
import { CATEGORICAL_PALETTE, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { CsvExportButton } from '@/components/data-table/csv-export-button'
import { CsvImportDialog } from '@/components/data-table/csv-import-dialog'
import { DeleteFlaggedRowsButton } from '@/components/data-table/delete-flagged-rows-button'
import { EditableDataTable } from '@/components/data-table/editable-data-table'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { bucketByMonth, formatDateLabel, formatMonthLabel, runningPositionOverTime } from '@/lib/aggregations'
import { getCurrentValue, type Transaction } from '@/lib/current-value'
import { contributionsSchema, useContributionsStore } from './contributions-store'
import { transactionSchema } from './transaction-schema'
import { useFixedIncomeStore } from './fixed-income-store'
import { useVariableIncomeStore } from './variable-income-store'

export function OverviewPanel() {
  const { t } = useTranslation('investments')
  const { items: variableItems } = useVariableIncomeStore()
  const { items: fixedItems } = useFixedIncomeStore()
  const visibleVariableItems = variableItems.filter((t) => !t.deleted)
  const visibleFixedItems = fixedItems.filter((t) => !t.deleted)

  const lineData = runningPositionOverTime([...visibleVariableItems, ...visibleFixedItems])
  const variableTotal = allocationPieData(variableItems).reduce((sum, d) => sum + d.value, 0)
  const fixedTotal = allocationPieData(fixedItems).reduce((sum, d) => sum + d.value, 0)
  const pieData = [
    { key: 'variableIncome', label: t('items.variableIncome'), value: variableTotal, color: DOMAIN_COLOR.variableIncome },
    { key: 'fixedIncome', label: t('items.fixedIncome'), value: fixedTotal, color: DOMAIN_COLOR.fixedIncome },
  ].filter((slice) => slice.value > 0)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
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
  const visibleItems = items.filter((t) => !t.deleted)
  const assets = [...new Set(visibleItems.map((t) => t.asset))]
  return assets
    .map((asset, i) => ({
      key: asset,
      label: asset,
      value: getCurrentValue(asset, visibleItems),
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
  deleteItems,
}: {
  id: string
  title: string
  color: (typeof DOMAIN_COLOR)['variableIncome']
  items: (Transaction & { id: number; createdAt: number })[]
  addItem: (row: Transaction) => void
  addItems: (rows: Transaction[]) => void
  deleteItem: (id: number) => void
  deleteItems: (ids: number[]) => void
}) {
  const visibleItems = items.filter((t) => !t.deleted)
  const lineData = runningPositionOverTime(visibleItems)
  const pieData = allocationPieData(items)

  return (
    <div className="flex h-full flex-col">
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
                  <DeleteFlaggedRowsButton
                    flaggedCount={items.filter((r) => r.deleted).length}
                    onConfirm={() => deleteItems(items.filter((r) => r.deleted).map((r) => r.id))}
                  />
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
  const { t } = useTranslation('investments')
  const { items, addItem, addItems, deleteItem, deleteItems } = useVariableIncomeStore()
  return (
    <TransactionLedgerPanel
      id="variableIncome"
      title={t('items.variableIncome')}
      color={DOMAIN_COLOR.variableIncome}
      items={items}
      addItem={addItem}
      addItems={addItems}
      deleteItem={deleteItem}
      deleteItems={deleteItems}
    />
  )
}

export function FixedIncomePanel() {
  const { t } = useTranslation('investments')
  const { items, addItem, addItems, deleteItem, deleteItems } = useFixedIncomeStore()
  return (
    <TransactionLedgerPanel
      id="fixedIncome"
      title={t('items.fixedIncome')}
      color={DOMAIN_COLOR.fixedIncome}
      items={items}
      addItem={addItem}
      addItems={addItems}
      deleteItem={deleteItem}
      deleteItems={deleteItems}
    />
  )
}

export function ContributionsPanel() {
  const { t } = useTranslation('investments')
  const { items, addItem, addItems, deleteItem, deleteItems } = useContributionsStore()
  const visibleItems = items.filter((r) => !r.deleted)

  const barData = bucketByMonth(visibleItems, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id="contributions"
          chart={
            <div className="h-full p-4">
              <AppBarChart
                data={barData}
                xKey="month"
                xFormatter={formatMonthLabel}
                series={{ key: 'amount', label: t('items.contributions'), color: DOMAIN_COLOR.contributions }}
              />
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
                  <DeleteFlaggedRowsButton
                    flaggedCount={items.filter((r) => r.deleted).length}
                    onConfirm={() => void deleteItems(items.filter((r) => r.deleted).map((r) => r.id))}
                  />
                </>
              }
            />
          }
        />
      </div>
    </div>
  )
}
