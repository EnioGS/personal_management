import { useState } from 'react'
import { Plus } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { KIND_REQUIRES_ACCOUNT, KIND_REQUIRES_CARD } from '@/lib/model/table-kinds'
import { useAccountsStore, useCardsStore } from '@/lib/model/model-stores'
import type { InvestmentClass, TableDef, TableKind } from '@/lib/model/types'

interface AddTableDialogProps {
  /** Kinds this workspace can hold — the first is the default selection. */
  kinds: TableKind[]
  /** Stored automatically for investment workspaces; never shown as a row column. */
  investmentClass?: InvestmentClass
  onCreate: (table: TableDef) => void
}

/**
 * Creates a table. Which *kind* it is fixes its columns (see table-kinds.ts), and the
 * account/card binding is what later lets a dashboard aggregate or split by them.
 */
export function AddTableDialog({ kinds, investmentClass, onCreate }: AddTableDialogProps) {
  const { t } = useTranslation(['common', 'investments'])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<TableKind>(kinds[0])
  const [investmentClassChoice, setInvestmentClassChoice] = useState<InvestmentClass>('variableIncome')
  const [accountId, setAccountId] = useState<string>('')
  const [cardId, setCardId] = useState<string>('')

  const accounts = useAccountsStore((s) => s.items)
  const cards = useCardsStore((s) => s.items)

  const needsAccount = KIND_REQUIRES_ACCOUNT.includes(kind)
  const needsCard = KIND_REQUIRES_CARD.includes(kind)

  function reset() {
    setName('')
    setKind(kinds[0])
    setInvestmentClassChoice('variableIncome')
    setAccountId('')
    setCardId('')
  }

  function handleCreate() {
    const resolvedInvestmentClass = investmentClass ?? (kind === 'investmentLedger' ? investmentClassChoice : undefined)
    const table: TableDef = { name: name.trim(), kind, ...(resolvedInvestmentClass ? { investmentClass: resolvedInvestmentClass } : {}) }
    if (needsAccount && accountId) table.accountId = Number(accountId)
    if (needsCard && cardId) table.cardId = Number(cardId)
    onCreate(table)
    setOpen(false)
    reset()
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
        <Button type="button" variant="outline" size="xs">
          <Plus className="size-3.5" />
          {t('table.addTable')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('table.addTableTitle')}</DialogTitle>
          <DialogDescription>{t('table.addTableDescription')}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">{t('table.tableName')}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>

          {kind === 'investmentLedger' && !investmentClass && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t('investments:columns.investmentClass')}</span>
              <Select value={investmentClassChoice} onValueChange={(value) => setInvestmentClassChoice(value as InvestmentClass)}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="variableIncome">{t('investments:items.variableIncome')}</SelectItem>
                  <SelectItem value="fixedIncome">{t('investments:items.fixedIncome')}</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium">{t('table.tableKind')}</span>
            <Select value={kind} onValueChange={(v) => setKind(v as TableKind)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((option) => (
                  <SelectItem key={option} value={option}>
                    {t(`tableKinds.${option}` as never)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {needsAccount && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t('table.tableAccount')}</span>
              {accounts.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t('table.noAccountsYet')}</p>
              ) : (
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={String(account.id)}>
                        {account.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </label>
          )}

          {needsCard && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t('table.tableCard')}</span>
              {cards.length === 0 ? (
                <p className="text-muted-foreground text-xs">{t('table.noCardsYet')}</p>
              ) : (
                <Select value={cardId} onValueChange={setCardId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={String(card.id)}>
                        {card.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </label>
          )}
        </div>

        <DialogFooter>
          <Button type="button" disabled={!name.trim()} onClick={handleCreate}>
            {t('table.addTableConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
