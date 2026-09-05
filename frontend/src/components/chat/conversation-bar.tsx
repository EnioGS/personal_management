import { useCallback, useEffect, useState } from 'react'
import { Coins, History, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { listConversations, type StoredConversation } from '@/lib/chat/conversations'
import { readUsageTotals, type UsageTotals } from '@/lib/chat/usage-ledger'
import { useChatStore } from '@/store/chat-store'
import { cn } from '@/lib/utils'

/**
 * The chat's own bar, the height of a row in the secondary bar so the two read as the
 * same kind of surface.
 *
 * Two things live here. Starting a new conversation, which discards nothing — the one on
 * screen was saved as it happened — and reaching the ones already had, which are only
 * read out of the database when the list is actually opened. The current conversation's
 * name is not repeated here: it is in the list, under the icon that opens it.
 */
export function ConversationBar() {
  const { t } = useTranslation('chat')
  const conversationId = useChatStore((store) => store.conversationId)
  const newConversation = useChatStore((store) => store.newConversation)
  const openConversation = useChatStore((store) => store.openConversation)
  const removeConversation = useChatStore((store) => store.removeConversation)
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [totals, setTotals] = useState<UsageTotals | null>(null)

  const refresh = useCallback(async () => {
    setConversations(await listConversations())
  }, [])

  const refreshTotals = useCallback(async () => {
    setConversations(await listConversations())
    setTotals(await readUsageTotals())
  }, [])

  // Opened, not watched: the list is read when it is asked for, and again after a
  // deletion, rather than kept in step with every message as it is written.
  useEffect(() => { void refresh() }, [refresh, conversationId])

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 px-2">
      <Button
        type="button"
        variant="ghost"
        aria-label={t('panel.newConversation')}
        title={t('panel.newConversation')}
        onClick={() => newConversation()}
        className="size-9 p-0"
      >
        <MessageSquarePlus className="size-4" />
      </Button>

      <DropdownMenu onOpenChange={(open) => { if (open) void refreshTotals() }}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" aria-label={t('panel.spending')} title={t('panel.spending')} className="size-9 p-0">
            <Coins className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-80 overflow-auto p-2 text-xs">
          <p className="text-muted-foreground mb-2">{t('panel.spendingDescription')}</p>
          {conversations.length === 0 ? (
            <p className="text-muted-foreground">{t('panel.noConversations')}</p>
          ) : (
            <div className="divide-y">
              {conversations.map((conversation) => (
                <div key={conversation.id} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate">{conversation.title}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {`${(conversation.usage?.tokens ?? 0).toLocaleString()} · ${formatCost(conversation.usage?.cost ?? 0)}`}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Two totals, because they answer different questions: what the conversations
              still here have cost, and what has been spent altogether — the second keeps
              counting what deleted conversations spent, since deleting one does not
              unspend it. */}
          <div className="mt-2 flex items-baseline justify-between gap-3 border-t pt-2 font-medium">
            <span>{t('panel.spendingSaved')}</span>
            <span className="tabular-nums">
              {`${conversations.reduce((sum, one) => sum + (one.usage?.tokens ?? 0), 0).toLocaleString()} · `}
              {formatCost(conversations.reduce((sum, one) => sum + (one.usage?.cost ?? 0), 0))}
            </span>
          </div>
          {totals && (
            <div className="text-muted-foreground flex items-baseline justify-between gap-3 pt-1">
              <span>{t('panel.spendingEver', { messages: totals.messages, requests: totals.requests })}</span>
              <span className="tabular-nums">{`${totals.tokens.toLocaleString()} · ${formatCost(totals.cost)}`}</span>
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu onOpenChange={(open) => { if (open) void refresh() }}>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" aria-label={t('panel.conversations')} title={t('panel.conversations')} className="size-9 p-0">
            <History className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-auto p-1 text-xs">
          {conversations.length === 0 ? (
            <p className="text-muted-foreground p-2">{t('panel.noConversations')}</p>
          ) : (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={cn(
                  'group hover:bg-accent flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5',
                  conversation.id === conversationId && 'text-primary',
                )}
                onClick={() => void openConversation(conversation.id)}
              >
                <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                {/* The trash appears on the row the pointer is over, so a list of names
                    does not read as a list of delete buttons. */}
                <button
                  type="button"
                  aria-label={t('panel.deleteConversation')}
                  title={t('panel.deleteConversation')}
                  className="text-destructive hidden shrink-0 rounded-sm p-0.5 group-hover:block"
                  onClick={(event) => {
                    event.stopPropagation()
                    void removeConversation(conversation.id).then(refresh)
                  }}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/**
 * Model prices run to millionths of a dollar a token, so a conversation can genuinely
 * cost a fraction of a cent — four decimals until it is worth rounding, since "$0.00"
 * would say the wrong thing about a number that is not zero.
 */
function formatCost(cost: number): string {
  return cost >= 0.01 ? `$${cost.toFixed(2)}` : `$${cost.toFixed(4)}`
}
