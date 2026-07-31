import { useRef, useState, type PointerEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useChatPanelStore } from '@/store/chat-panel-store'
import { useChatStore } from '@/store/chat-store'
import { useVaultStore } from '@/store/vault-store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'

const PANEL_WIDTH = 384
const HANDLE_WIDTH = 28
const DRAG_THRESHOLD = 60

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

/**
 * Global chat overlay — mounted once at the app root (see App.tsx), not inside
 * AppShell's resizable layout, so switching sections never affects it and it
 * never affects section content. Fixed positioning + a z-index below dialogs
 * (z-40, shadcn dialogs use z-50) keeps it above everything else regardless.
 */
export function ChatPanel() {
  const { t } = useTranslation('chat')
  const isOpen = useChatPanelStore((s) => s.isOpen)
  const hasUnread = useChatPanelStore((s) => s.hasUnread)
  const open = useChatPanelStore((s) => s.open)
  const close = useChatPanelStore((s) => s.close)
  const markInteracted = useChatPanelStore((s) => s.markInteracted)
  const messages = useChatStore((s) => s.messages)
  const isSending = useChatStore((s) => s.isSending)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const isUnlocked = useVaultStore((s) => s.passphrase !== null)

  const [draft, setDraft] = useState('')
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const dragStartX = useRef(0)
  const dragStartOpen = useRef(isOpen)
  const didDrag = useRef(false)

  const closedTranslate = PANEL_WIDTH - HANDLE_WIDTH

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartX.current = e.clientX
    dragStartOpen.current = isOpen
    didDrag.current = false
    setDragOffset(0)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragOffset === null) return
    const delta = e.clientX - dragStartX.current
    if (Math.abs(delta) > 4) didDrag.current = true
    setDragOffset(delta)
  }

  function handlePointerUp() {
    if (dragOffset === null) return
    const delta = dragOffset
    setDragOffset(null)
    markInteracted()

    if (!didDrag.current) {
      if (isOpen) close()
      else open()
      return
    }

    if (dragStartOpen.current) {
      if (delta > DRAG_THRESHOLD) close()
      else open()
    } else {
      if (delta < -DRAG_THRESHOLD) open()
      else close()
    }
  }

  const baseTranslate = isOpen ? 0 : closedTranslate
  const translate = dragOffset !== null ? clamp(baseTranslate + dragOffset, 0, closedTranslate) : baseTranslate

  return (
    <div
      className={cn('fixed inset-y-0 right-0 z-40 flex', dragOffset === null && 'transition-transform duration-200 ease-out')}
      style={{ width: PANEL_WIDTH, transform: `translateX(${translate}px)` }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={t('panel.toggle')}
        aria-pressed={isOpen}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          markInteracted()
          if (isOpen) close()
          else open()
        }}
        className={cn(
          'absolute top-1/2 left-0 z-10 flex h-32 w-7 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-l-md border border-r-0 select-none active:cursor-grabbing',
          hasUnread ? 'bg-brand' : 'bg-border',
        )}
      >
        <GripVertical className={cn('size-4', hasUnread ? 'text-brand-foreground' : 'text-sidebar-foreground/70')} />
      </div>

      <div className="flex h-full w-full flex-col border-l bg-sidebar shadow-lg" onClick={markInteracted}>
        <div className="border-b p-3">
          <h2 className="text-sm font-medium">{t('panel.heading')}</h2>
        </div>

        <ScrollArea className="flex-1">
          <div className="flex flex-col gap-2 p-3">
            {messages.length === 0 && <p className="text-muted-foreground text-sm">{t('panel.emptyState')}</p>}
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  'max-w-[85%] rounded-md px-3 py-2 text-sm',
                  message.isError
                    ? 'self-start bg-destructive/10 text-destructive'
                    : message.role === 'user'
                      ? 'self-end bg-brand text-brand-foreground'
                      : 'self-start bg-muted',
                )}
              >
                {message.content}
              </div>
            ))}
          </div>
        </ScrollArea>

        {isUnlocked ? (
          <form
            className="flex gap-2 border-t p-3"
            onSubmit={(e) => {
              e.preventDefault()
              if (!draft.trim() || isSending) return
              void sendMessage(draft.trim())
              setDraft('')
            }}
          >
            <Input
              placeholder={t('panel.inputPlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isSending}
            />
            <Button type="submit" disabled={!draft.trim() || isSending}>
              {t('panel.send')}
            </Button>
          </form>
        ) : (
          <p className="text-muted-foreground border-t p-3 text-sm">{t('panel.locked')}</p>
        )}
      </div>
    </div>
  )
}
