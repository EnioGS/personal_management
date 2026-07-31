import { useTranslation } from 'react-i18next'
import { AppLineChart } from '@/components/charts/line-chart'
import { AppPieChart } from '@/components/charts/pie-chart'
import { CATEGORICAL_PALETTE, DOMAIN_COLOR } from '@/components/charts/chart-colors'
import { CsvExportButton } from '@/components/data-table/csv-export-button'
import { CsvImportDialog } from '@/components/data-table/csv-import-dialog'
import { EditableDataTable } from '@/components/data-table/editable-data-table'
import { ChartTablePanel } from '@/components/layout/chart-table-panel'
import { LockButton, UnlockGate } from '@/components/layout/unlock-gate'
import { bucketByMonth, formatDateLabel, formatMonthLabel, groupByKey, runningBalance } from '@/lib/aggregations'
import { incomeSchema, useIncomeStore } from './income-store'
import { spendingSchema, useSpendingStore } from './spending-store'

export function OverviewPanel() {
  return (
    <UnlockGate>
      <OverviewContent />
    </UnlockGate>
  )
}

function OverviewContent() {
  const { t } = useTranslation('finances')
  const { items: spending } = useSpendingStore()
  const { items: income } = useIncomeStore()

  const balanceData = runningBalance(income, spending)

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{t('items.overview')}</h2>
        <LockButton />
      </div>
      <div className="min-h-0 flex-1">
        <AppLineChart
          data={balanceData}
          xKey="date"
          xFormatter={formatDateLabel}
          series={[{ key: 'balance', label: t('items.overview'), color: DOMAIN_COLOR.balance }]}
        />
      </div>
    </div>
  )
}

export function SpendingPanel() {
  return (
    <UnlockGate>
      <SpendingContent />
    </UnlockGate>
  )
}

function SpendingContent() {
  const { t } = useTranslation('finances')
  const { items, addItem, addItems, deleteItem } = useSpendingStore()

  const lineData = bucketByMonth(items, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))
  const pieData = groupByKey(items, 'category', 'amount').map((d, i) => ({
    key: d.label,
    label: d.label,
    value: d.value,
    color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
  }))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 pb-0">
        <h2 className="text-sm font-medium">{t('items.spending')}</h2>
        <LockButton />
      </div>
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id="spending"
          chart={
            <div className="grid h-full grid-cols-2 gap-4 p-4">
              <AppLineChart
                data={lineData}
                xKey="month"
                xFormatter={formatMonthLabel}
                series={[{ key: 'amount', label: t('items.spending'), color: DOMAIN_COLOR.spending }]}
              />
              <AppPieChart data={pieData} />
            </div>
          }
          table={
            <EditableDataTable
              schema={spendingSchema}
              rows={items}
              onAddRow={(row) => void addItem(row)}
              onDeleteRow={(id) => void deleteItem(id)}
              actions={
                <>
                  <CsvExportButton rows={items} schema={spendingSchema} filename="spending.csv" />
                  <CsvImportDialog schema={spendingSchema} onImport={(rows) => void addItems(rows)} />
                </>
              }
            />
          }
        />
      </div>
    </div>
  )
}

export function IncomePanel() {
  return (
    <UnlockGate>
      <IncomeContent />
    </UnlockGate>
  )
}

function IncomeContent() {
  const { t } = useTranslation('finances')
  const { items, addItem, addItems, deleteItem } = useIncomeStore()

  const lineData = bucketByMonth(items, 'date', 'amount').map((d) => ({ month: d.month, amount: d.total }))
  const pieData = groupByKey(items, 'source', 'amount').map((d, i) => ({
    key: d.label,
    label: d.label,
    value: d.value,
    color: CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length],
  }))

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between p-4 pb-0">
        <h2 className="text-sm font-medium">{t('items.income')}</h2>
        <LockButton />
      </div>
      <div className="min-h-0 flex-1">
        <ChartTablePanel
          id="income"
          chart={
            <div className="grid h-full grid-cols-2 gap-4 p-4">
              <AppLineChart
                data={lineData}
                xKey="month"
                xFormatter={formatMonthLabel}
                series={[{ key: 'amount', label: t('items.income'), color: DOMAIN_COLOR.income }]}
              />
              <AppPieChart data={pieData} />
            </div>
          }
          table={
            <EditableDataTable
              schema={incomeSchema}
              rows={items}
              onAddRow={(row) => void addItem(row)}
              onDeleteRow={(id) => void deleteItem(id)}
              actions={
                <>
                  <CsvExportButton rows={items} schema={incomeSchema} filename="income.csv" />
                  <CsvImportDialog schema={incomeSchema} onImport={(rows) => void addItems(rows)} />
                </>
              }
            />
          }
        />
      </div>
    </div>
  )
}
