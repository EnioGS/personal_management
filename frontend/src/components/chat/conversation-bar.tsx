import { useCallback, useEffect, useState } from 'react'
import { History, MessageSquarePlus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { listConversations, type StoredConversation } from '@/lib/chat/conversations'
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

  const refresh = useCallback(async () => {
    setConversations(await listConversations())
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
