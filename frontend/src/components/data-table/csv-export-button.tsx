import { Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { exportCsv } from '@/lib/csv'
import type { TableSchema } from '@/lib/table-schema'

interface CsvExportButtonProps<T extends Record<string, unknown>> {
  rows: T[]
  schema: TableSchema<T>
  filename: string
}

export function CsvExportButton<T extends Record<string, unknown>>({
  rows,
  schema,
  filename,
}: CsvExportButtonProps<T>) {
  const { t } = useTranslation()
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        const csv = exportCsv(rows, schema)
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        a.click()
        URL.revokeObjectURL(url)
      }}
    >
      <Download className="size-4" />
      {t('table.exportCsv')}
    </Button>
  )
}
