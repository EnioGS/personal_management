import { useState } from 'react'
import { Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAccountsStore, useCardsStore } from '@/lib/model/model-stores'
import type { Account, AccountKind, Card } from '@/lib/model/types'

const ACCOUNT_KINDS: AccountKind[] = ['checking', 'savings', 'cash', 'broker']

export function AccountsCardsPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <AccountsSection />
      <CardsSection />
    </div>
  )
}

function AccountsSection() {
  const { t } = useTranslation('settings')
  const accounts = useAccountsStore((s) => s.items)
  const addAccount = useAccountsStore((s) => s.addItem)
  const updateAccount = useAccountsStore((s) => s.updateItem)
  const deleteAccount = useAccountsStore((s) => s.deleteItem)
  const cards = useCardsStore((s) => s.items)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<AccountKind>('checking')
  const [institution, setInstitution] = useState('')

  function reset() {
    setName('')
    setKind('checking')
    setInstitution('')
  }

  function hasDependents(accountId: number) {
    return cards.some((c) => c.accountId === accountId)
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t('accountsCards.accountsHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('accountsCards.accountsDescription')}</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) reset()
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="xs">
              <Plus className="size-3.5" />
              {t('accountsCards.addAccount')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('accountsCards.addAccount')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('accountsCards.accountName')}</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('accountsCards.accountKind')}</span>
                <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_KINDS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`accountsCards.accountKinds.${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('accountsCards.institution')}</span>
                <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                disabled={!name.trim()}
                onClick={() => {
                  const account: Account = { name: name.trim(), kind }
                  if (institution.trim()) account.institution = institution.trim()
                  void addAccount(account)
                  setDialogOpen(false)
                  reset()
                }}
              >
                {t('accountsCards.addAccountConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
          {t('accountsCards.noAccounts')}
        </p>
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {accounts.map((account) => (
            <div key={account.id} className={cn('flex items-center justify-between p-2', account.archived && 'opacity-50')}>
              <div className="min-w-0">
                <p className="truncate text-sm">{account.name}</p>
                <p className="text-muted-foreground text-xs">
                  {t(`accountsCards.accountKinds.${account.kind}` as never)}
                  {account.institution && ` · ${account.institution}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={account.archived ? t('accountsCards.unarchive') : t('accountsCards.archive')}
                  onClick={() => {
                    const { id, createdAt: _createdAt, ...rest } = account
                    void updateAccount(id, { ...rest, archived: !account.archived })
                  }}
                >
                  {account.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('accountsCards.deleteAccount')}
                      disabled={hasDependents(account.id)}
                      title={hasDependents(account.id) ? t('accountsCards.deleteBlockedHasDependents') : undefined}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('accountsCards.deleteAccountDialogTitle', { name: account.name })}</AlertDialogTitle>
                      <AlertDialogDescription>{t('accountsCards.deleteAccountDialogDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('accountsCards.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void deleteAccount(account.id)}>
                        {t('accountsCards.deleteAccountConfirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function CardsSection() {
  const { t } = useTranslation('settings')
  const accounts = useAccountsStore((s) => s.items)
  const cards = useCardsStore((s) => s.items)
  const addCard = useCardsStore((s) => s.addItem)
  const updateCard = useCardsStore((s) => s.updateItem)
  const deleteCard = useCardsStore((s) => s.deleteItem)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [limit, setLimit] = useState('')

  function reset() {
    setName('')
    setAccountId('')
    setLimit('')
  }

  function accountName(id: number) {
    return accounts.find((a) => a.id === id)?.name ?? '—'
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t('accountsCards.cardsHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('accountsCards.cardsDescription')}</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) reset()
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="xs" disabled={accounts.length === 0}>
              <Plus className="size-3.5" />
              {t('accountsCards.addCard')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('accountsCards.addCard')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('accountsCards.cardName')}</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('accountsCards.cardAccount')}</span>
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
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('accountsCards.cardLimit')}</span>
                <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                disabled={!name.trim() || !accountId}
                onClick={() => {
                  const card: Card = { name: name.trim(), accountId: Number(accountId) }
                  if (limit.trim()) card.limit = Number(limit)
                  void addCard(card)
                  setDialogOpen(false)
                  reset()
                }}
              >
                {t('accountsCards.addCardConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 && (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
          {t('accountsCards.addAccountFirst')}
        </p>
      )}

      {accounts.length > 0 && cards.length === 0 && (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">
          {t('accountsCards.noCards')}
        </p>
      )}

      {cards.length > 0 && (
        <div className="flex flex-col divide-y rounded-md border">
          {cards.map((card) => (
            <div key={card.id} className={cn('flex items-center justify-between p-2', card.archived && 'opacity-50')}>
              <div className="min-w-0">
                <p className="truncate text-sm">{card.name}</p>
                <p className="text-muted-foreground text-xs">{accountName(card.accountId)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={card.archived ? t('accountsCards.unarchive') : t('accountsCards.archive')}
                  onClick={() => {
                    const { id, createdAt: _createdAt, ...rest } = card
                    void updateCard(id, { ...rest, archived: !card.archived })
                  }}
                >
                  {card.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('accountsCards.deleteCard')}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('accountsCards.deleteCardDialogTitle', { name: card.name })}</AlertDialogTitle>
                      <AlertDialogDescription>{t('accountsCards.deleteCardDialogDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('accountsCards.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void deleteCard(card.id)}>
                        {t('accountsCards.deleteCardConfirm')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
