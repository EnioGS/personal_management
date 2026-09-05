import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import { GripVertical, Hourglass, Paperclip, SendHorizontal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MessageContent } from './message-content'
import { ConversationBar } from './conversation-bar'
import { readAttachedFile } from '@/lib/chat-attachments'
import { cn } from '@/lib/utils'
import { GRIP_WIDTH, MAX_PANEL_WIDTH, useChatPanelStore } from '@/store/chat-panel-store'
import { useChatStore } from '@/store/chat-store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

const DRAG_THRESHOLD = 4
const MAX_COMPOSER_LINES = 8

/**
 * Global chat overlay — mounted once at the app root (see App.tsx), not inside
 * AppShell's resizable layout, so switching sections never affects it and it
 * never affects section content. Fixed positioning + a z-index below dialogs
 * (z-40, shadcn dialogs use z-50) keeps it above everything else regardless.
 */
export function ChatPanel() {
  const { t } = useTranslation('chat')
  const panelWidth = useChatPanelStore((s) => s.panelWidth)
  const hasUnread = useChatPanelStore((s) => s.hasUnread)
  const setPanelWidth = useChatPanelStore((s) => s.setPanelWidth)
  const togglePanel = useChatPanelStore((s) => s.togglePanel)
  const markInteracted = useChatPanelStore((s) => s.markInteracted)
  const messages = useChatStore((s) => s.messages)
  const isSending = useChatStore((s) => s.isSending)
  const status = useChatStore((s) => s.status)
  const sendMessage = useChatStore((s) => s.sendMessage)
  const restoreLastConversation = useChatStore((s) => s.restoreLastConversation)
  const attachments = useChatStore((s) => s.attachments)
  const addAttachment = useChatStore((s) => s.addAttachment)
  const removeAttachment = useChatStore((s) => s.removeAttachment)
  const pushError = useChatStore((s) => s.pushError)
  const usage = useChatStore((s) => s.usage)

  const [draft, setDraft] = useState('')
  /** Anything typed hands the composer the whole width until it is sent or cleared. */
  const isComposing = draft.trim().length > 0
  /**
   * True once the message no longer fits on one line. Send then leaves the row entirely
   * — it becomes a round button outside the panel — and the composer takes the full
   * width, which is what a message long enough to wrap actually needs.
   */
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(panelWidth)
  const didDrag = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  function resizeComposer() {
    const composer = composerRef.current
    if (!composer) return

    const styles = window.getComputedStyle(composer)
    const lineHeight = Number.parseFloat(styles.lineHeight)
    const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
    const verticalBorder = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth)
    const maxHeight = lineHeight * MAX_COMPOSER_LINES + verticalPadding + verticalBorder

    // Reset before measuring so deleting text immediately shrinks the composer again.
    composer.style.height = 'auto'
    const wanted = composer.scrollHeight
    composer.style.height = `${Math.min(wanted, maxHeight)}px`
    composer.style.overflowY = wanted > maxHeight ? 'auto' : 'hidden'
    setIsOverflowing(wanted > lineHeight + verticalPadding + verticalBorder + 1)
  }

  useEffect(() => {
    // Scroll only the message list's own viewport directly — `scrollIntoView` walks up
    // and can adjust *every* scrollable ancestor's scroll position along the way,
    // including this panel's own outer clipping wrapper (invisible, no scrollbar, but
    // still programmatically scrollable), which visually fights the width transition.
    // A direct, targeted scroll has no such risk.
    const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]')
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  useEffect(() => {
    resizeComposer()
  }, [draft])

  // The conversation comes back by itself: nothing was ever saved by hand, so nothing
  // should have to be reopened by hand either.
  useEffect(() => {
    void restoreLastConversation()
  }, [restoreLastConversation])

  // The panel is mounted while closed, where the composer is a few pixels wide and
  // its placeholder wraps into many lines — measuring there would open the panel with
  // a composer already at its maximum height. Re-measure whenever the element's own
  // width actually changes (opening the panel, dragging it wider or narrower), which
  // is also what makes the height track the text at every panel width.
  useEffect(() => {
    const composer = composerRef.current
    if (!composer || typeof ResizeObserver === 'undefined') return
    let lastWidth = composer.clientWidth
    const observer = new ResizeObserver(() => {
      // Ignore the height changes this very effect causes; only width matters here.
      if (composer.clientWidth === lastWidth) return
      lastWidth = composer.clientWidth
      resizeComposer()
    })
    observer.observe(composer)
    return () => observer.disconnect()
  }, [])

  async function handleFilesSelected(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      const result = await readAttachedFile(file)
      if ('error' in result) pushError(result.error)
      else addAttachment(result.attachment)
    }
  }

  function handleFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    // `e.target.files` is a live FileList — snapshot it into a real array before
    // resetting `value` (needed so re-selecting the same file still fires onChange),
    // otherwise the reset empties the very list we're about to read.
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length > 0) void handleFilesSelected(files)
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDraggingFileOver(true)
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return
    setIsDraggingFileOver(false)
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDraggingFileOver(false)
    if (e.dataTransfer.files.length > 0) void handleFilesSelected(e.dataTransfer.files)
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    dragStartX.current = e.clientX
    dragStartWidth.current = panelWidth
    didDrag.current = false
    setDragOffset(0)
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (dragOffset === null) return
    const delta = e.clientX - dragStartX.current
    if (Math.abs(delta) > DRAG_THRESHOLD) didDrag.current = true
    setDragOffset(delta)
  }

  function handlePointerUp() {
    if (dragOffset === null) return
    const delta = dragOffset
    setDragOffset(null)
    markInteracted()

    if (!didDrag.current) {
      togglePanel()
      return
    }

    // The grip sits on the panel's left edge and the panel's right edge is pinned to
    // the screen edge, so dragging the grip left (negative delta) widens the panel and
    // dragging it right narrows it — hence subtracting, not adding, delta here.
    setPanelWidth(dragStartWidth.current - delta)
  }

  function submitDraft() {
    if (!draft.trim() || isSending) return
    void sendMessage(draft.trim())
    setDraft('')
  }

  // While actively dragging, track the pointer directly instead of the (not-yet-committed)
  // store value, so the panel follows the cursor with no snap-to-minimum until release.
  const liveWidth = dragOffset !== null ? Math.max(0, Math.min(MAX_PANEL_WIDTH, panelWidth - dragOffset)) : panelWidth

  return (
    // The box's real width is GRIP_WIDTH + liveWidth — content is genuinely that wide
    // (not a fixed-width panel revealed through a clipping window), so it reflows as
    // the width changes, and the grip — the box's first GRIP_WIDTH px — is always
    // on-screen, including when the panel itself is fully closed at liveWidth 0.
    // overflow-hidden stays as a safety net against any transient horizontal overflow
    // during the width transition, not as the sizing mechanism itself.
    <div
      className={cn(
        'pointer-events-none fixed inset-y-0 right-0 z-40 flex overflow-hidden',
        dragOffset === null && 'transition-[width] duration-200 ease-out',
      )}
      style={{ width: GRIP_WIDTH + liveWidth }}
    >
      {/* Outside the panel, and staying there: a message written into a panel that is
          then closed still has somewhere to go, faded but present, and sending it brings
          the button home. */}
      <button
        type="button"
        aria-label={t('panel.send')}
        title={t('panel.send')}
        onClick={submitDraft}
        className={cn(
          'bg-primary text-primary-foreground pointer-events-auto absolute bottom-4 left-0 z-20 flex size-10 items-center justify-center rounded-full shadow-lg',
          'transition-[opacity,transform,scale] duration-200 ease-out',
          isOverflowing || (panelWidth === 0 && isComposing)
            ? 'scale-100 opacity-100'
            : 'pointer-events-none scale-50 opacity-0',
          panelWidth === 0 && 'opacity-60',
        )}
      >
        <SendHorizontal className="size-4" />
      </button>

      <div
        role="button"
        tabIndex={0}
        aria-label={t('panel.toggle')}
        aria-pressed={panelWidth > 0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          markInteracted()
          togglePanel()
        }}
        className={cn(
          'pointer-events-auto absolute top-1/2 left-0 z-10 flex h-8 w-5 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-l-md border border-r-0 select-none active:cursor-grabbing',
          hasUnread ? 'bg-brand' : 'bg-border',
        )}
      >
        <GripVertical className={cn('size-4', hasUnread ? 'text-brand-foreground' : 'text-sidebar-foreground/70')} />
      </div>

      <div
        className="pointer-events-auto relative ml-5 flex h-full min-w-0 flex-1 flex-col border-l bg-sidebar shadow-lg"
        onClick={markInteracted}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {isDraggingFileOver && (
          <div className="border-brand bg-brand/10 text-brand pointer-events-none absolute inset-0 z-20 m-2 flex items-center justify-center rounded-md border-2 border-dashed text-sm font-medium">
            {t('panel.dropHint')}
          </div>
        )}

        <ConversationBar />

        <div ref={scrollAreaRef} className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="flex flex-col gap-2 p-3">
              {messages.length === 0 && <p className="text-muted-foreground text-sm">{t('panel.emptyState')}</p>}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'flex max-w-[85%] flex-col gap-0.5',
                    message.role === 'user' ? 'self-end items-end' : 'self-start items-start',
                  )}
                >
                  {message.role === 'assistant' && !message.isError && message.model && (
                    <span className="text-muted-foreground px-1 text-[10px]">{message.model}</span>
                  )}
                  <div
                    className={cn(
                      'rounded-md px-3 py-2 text-sm break-words',
                      message.isError
                        ? 'bg-destructive/10 text-destructive'
                        : message.role === 'user'
                          ? 'bg-brand text-brand-foreground'
                          : 'bg-muted',
                    )}
                  >
                    <MessageContent content={message.content} tone={message.role} />
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="text-muted-foreground flex max-w-[85%] items-center gap-2 self-start rounded-md bg-muted px-3 py-2 text-sm">
                  <Hourglass className="size-4 animate-spin" />
                  {status.type === 'tool'
                    ? t('panel.statusUsingTool', { name: status.name })
                    : t('panel.statusWaiting')}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t px-3 pt-3">
            {attachments.map((attachment) => (
              <span
                key={attachment.id}
                className="bg-muted flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-xs"
              >
                {attachment.name}
                <button
                  type="button"
                  aria-label={t('panel.removeAttachment')}
                  onClick={() => removeAttachment(attachment.id)}
                  className="hover:bg-background/60 rounded-full p-0.5"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* One quiet line, under the messages and above the composer: what the last
            exchange cost, what the session has cost, and how full the model's window
            is. Hidden until there is something to report, so an idle panel stays calm. */}
        {usage.sessionTokens > 0 && (
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t px-3 pt-1.5 text-[11px]">
            <span>{t('panel.usageLast', { tokens: usage.lastMessageTokens.toLocaleString(), rounds: usage.lastMessageRounds })}</span>
            <span>{t('panel.usageSession', { tokens: usage.sessionTokens.toLocaleString() })}</span>
            {usage.sessionCost !== null && (
              <span title={usage.lastMessageCost !== null ? t('panel.usageCostLast', { cost: formatCost(usage.lastMessageCost) }) : undefined}>
                {t('panel.usageCost', { cost: formatCost(usage.sessionCost) })}
              </span>
            )}
            <span className={cn(usage.contextWindow && usage.contextTokens / usage.contextWindow > 0.8 && 'text-amber-600 dark:text-amber-300')}>
              {usage.contextWindow
                ? t('panel.usageContext', { tokens: usage.contextTokens.toLocaleString(), window: usage.contextWindow.toLocaleString(), percent: Math.round((usage.contextTokens / usage.contextWindow) * 100) })
                : t('panel.usageContextUnknown', { tokens: usage.contextTokens.toLocaleString() })}
            </span>
          </div>
        )}

        <form
          className={cn('flex items-end gap-2 p-3', attachments.length === 0 && !usage.sessionTokens && 'border-t')}
          onSubmit={(e) => {
            e.preventDefault()
            submitDraft()
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,.csv"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          {/* Send sits at the left of the row until the message outgrows one line, and
              then leaves the row altogether — see the floating button below, which is the
              same action in the place a wrapped message leaves for it. */}
          {!isOverflowing && (
            <Button
              type="submit"
              disabled={!draft.trim() || isSending}
              size={isComposing ? 'icon' : 'default'}
              aria-label={t('panel.send')}
              title={t('panel.send')}
              className="shrink-0"
            >
              {isComposing ? <SendHorizontal className="size-4" /> : t('panel.send')}
            </Button>
          )}

          {/* The clip lives inside the box it acts on, in the placeholder's own colour:
              attaching a file is part of writing the message, not a control beside it. */}
          <div className="relative min-w-0 flex-1">
            <Textarea
              ref={composerRef}
              rows={1}
              placeholder={t('panel.inputPlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitDraft()
                }
              }}
              disabled={isSending}
              className="[field-sizing:fixed] min-h-0 resize-none overflow-y-hidden pr-9 leading-5"
            />
            <button
              type="button"
              aria-label={t('panel.attachButton')}
              title={t('panel.attachButton')}
              onClick={() => fileInputRef.current?.click()}
              className="text-muted-foreground hover:text-foreground absolute right-2 bottom-1.5 rounded-sm p-0.5"
            >
              <Paperclip className="size-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Model prices run to millionths of a dollar a token, so a session can genuinely cost
 * a fraction of a cent — shown to four decimals until it is worth rounding, since
 * "$0.00" would say the wrong thing about a number that is not zero.
 */
function formatCost(cost: number): string {
  return cost >= 0.01 ? `$${cost.toFixed(2)}` : `$${cost.toFixed(4)}`
}
