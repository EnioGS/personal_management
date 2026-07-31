import { useState } from 'react'
import { Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { parseCsv, type CsvError } from '@/lib/csv'
import type { TableSchema } from '@/lib/table-schema'

interface CsvImportDialogProps<T extends Record<string, unknown>> {
  schema: TableSchema<T>
  onImport: (rows: T[]) => void
}

export function CsvImportDialog<T extends Record<string, unknown>>({ schema, onImport }: CsvImportDialogProps<T>) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [valid, setValid] = useState<T[]>([])
  const [errors, setErrors] = useState<CsvError[]>([])

  function reset() {
    setValid([])
    setErrors([])
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Upload className="size-4" />
          {t('table.importCsv')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('table.importCsv')}</DialogTitle>
          <DialogDescription>{t('table.importDescription')}</DialogDescription>
        </DialogHeader>

        <input
          type="file"
          accept=".csv,text/csv"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const text = await file.text()
            const result = parseCsv<T>(text, schema)
            setValid(result.valid)
            setErrors(result.errors)
          }}
        />

        {valid.length > 0 && <p className="text-sm">{t('table.importValidCount', { count: valid.length })}</p>}
        {errors.length > 0 && (
          <ul className="text-destructive max-h-40 overflow-auto text-xs">
            {errors.map((err) => (
              <li key={err.rowIndex}>{t('table.importRowError', { row: err.rowIndex + 1, message: err.message })}</li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button
            type="button"
            disabled={valid.length === 0}
            onClick={() => {
              onImport(valid)
              setOpen(false)
              reset()
            }}
          >
            {t('table.importConfirm', { count: valid.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
