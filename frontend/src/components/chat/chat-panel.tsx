import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import { GripVertical, Hourglass, Paperclip, SendHorizontal, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { MarkdownText } from '@/components/markdown/markdown-text'
import { ConversationBar } from './conversation-bar'
import { ACCEPTED_ATTACHMENTS, readAttachedFile } from '@/lib/chat-attachments'
import { readDraft, writeDraft } from '@/lib/chat/draft'
import { cn } from '@/lib/utils'
import { GRIP_WIDTH, MAX_PANEL_WIDTH, MIN_PANEL_WIDTH, useChatPanelStore } from '@/store/chat-panel-store'
import { useChatStore, type ChatMessage } from '@/store/chat-store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

const DRAG_THRESHOLD = 4
const MAX_COMPOSER_LINES = 8
/** What Send occupies in the composer row: its own width plus the gap beside it. */
const SEND_IN_ROW_WIDTH = 48
/** The composer row's padding — `p-3` on the form, in pixels. */
const COMPOSER_PADDING = 12

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
  const queued = useChatStore((s) => s.queued)

  // Read once per conversation and written on every keystroke: a sentence someone is
  // halfway through is work, and a reload should not be able to take it.
  const conversationId = useChatStore((s) => s.conversationId)
  const [draft, setDraft] = useState(() => readDraft(conversationId))
  const [draftFor, setDraftFor] = useState(conversationId)
  if (draftFor !== conversationId) {
    setDraftFor(conversationId)
    setDraft(readDraft(conversationId))
  }
  const write = useCallback((text: string) => {
    setDraft(text)
    writeDraft(conversationId, text)
  }, [conversationId])
  /** Anything typed hands the composer the whole width until it is sent or cleared. */
  const isComposing = draft.trim().length > 0
  /**
   * True once the message no longer fits on one line. Send then leaves the row entirely
   * — it becomes a round button outside the panel — and the composer takes the full
   * width, which is what a message long enough to wrap actually needs.
   */
  const [isOverflowing, setIsOverflowing] = useState(false)
  /** Read inside the measurement, which must know the layout it is measuring against. */
  const isFloatingRef = useRef(false)
  /** What the box is now, so the round button can sit level with the middle of it. */
  const [composerHeight, setComposerHeight] = useState(0)
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const [isDraggingFileOver, setIsDraggingFileOver] = useState(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(panelWidth)
  const didDrag = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)
  /** The message as it is now, for the measurements that outlive the render they were made in. */
  const draftRef = useRef(draft)
  draftRef.current = draft
  /** Box properties that do not change with the message, read once instead of per keystroke. */
  const metrics = useRef<{ singleLine: number; maxHeight: number } | null>(null)
  const mirrorDressed = useRef(false)
  const pendingResize = useRef<number | null>(null)
  /** The width the last measurement ran at, so the observer can tell its own echo apart. */
  const lastMeasuredWidth = useRef(0)

  /**
   * How tall the message would be in a box of a given width.
   *
   * Measured in a hidden mirror rather than in the textarea, because the textarea's own
   * height is the thing being decided: measuring it means measuring the layout it is
   * currently in, and the layout depends on the answer. The mirror is out of flow and
   * takes whatever width it is told, so the same question always gets the same answer —
   * which is what stops the box growing a line and giving it back a frame later.
   */
  const heightAt = useCallback((width: number): number => {
    const composer = composerRef.current
    const mirror = mirrorRef.current
    if (!composer || !mirror) return 0

    // The mirror's type is copied once, not on every keystroke: reading a computed style
    // forces the browser to resolve style for the page, and the page has a table of a few
    // thousand cells in it.
    if (!mirrorDressed.current) {
      const styles = window.getComputedStyle(composer)
      for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing'] as const) {
        mirror.style[property] = styles[property]
      }
      mirrorDressed.current = true
    }
    mirror.style.width = `${width}px`
    // Read from a ref, not from the render that created this function: the resize
    // observer holds on to it, and a measurement of the message as it was when the panel
    // opened is a measurement of an empty box.
    // The zero-width space keeps a trailing newline — and an empty box — measurable.
    mirror.textContent = `${draftRef.current}\u200b`
    return mirror.scrollHeight
  }, [])

  const resizeComposerNow = useCallback(() => {
    const composer = composerRef.current
    if (!composer) return
    // A closed panel is a few pixels wide, where the placeholder wraps into a paragraph
    // and every measurement is a lie. Nothing is measured until the box is really there.
    if (composer.clientWidth < 80) return

    // Measured once and kept: these are properties of the box, not of the message, and
    // asking for them per keystroke is asking the browser to resolve style for the page.
    if (!metrics.current) {
      const styles = window.getComputedStyle(composer)
      const lineHeight = Number.parseFloat(styles.lineHeight)
      const verticalPadding = Number.parseFloat(styles.paddingTop) + Number.parseFloat(styles.paddingBottom)
      const verticalBorder = Number.parseFloat(styles.borderTopWidth) + Number.parseFloat(styles.borderBottomWidth)
      metrics.current = {
        singleLine: lineHeight + verticalPadding + verticalBorder + 1,
        maxHeight: lineHeight * MAX_COMPOSER_LINES + verticalPadding + verticalBorder,
      }
    }
    const { singleLine, maxHeight } = metrics.current

    // Both widths the row can have, named from the layout rather than from the moment.
    const narrowWidth = isFloatingRef.current ? composer.clientWidth - SEND_IN_ROW_WIDTH : composer.clientWidth
    const wideWidth = narrowWidth + SEND_IN_ROW_WIDTH
    const wraps = heightAt(narrowWidth) > singleLine
    const wanted = heightAt(wraps ? wideWidth : narrowWidth)

    const height = Math.min(wanted, maxHeight)
    composer.style.height = `${height}px`
    composer.style.overflowY = wanted > maxHeight ? 'auto' : 'hidden'
    // Nothing is written to the width here. Pinning it changed the box's own size, which
    // woke the observer below, which measured again, which handed the width back, which
    // woke it again — a measurement every frame for as long as the app was open, and the
    // reason it felt slow with nothing in it at all. The mirror already measures the
    // width the box is about to have, so the height is right without touching it.
    lastMeasuredWidth.current = composer.clientWidth
    setIsOverflowing(wraps)
    setComposerHeight(height)
  }, [heightAt])

  /**
   * At most one measurement a frame.
   *
   * Measuring means writing to the DOM and reading a height back, which makes the browser
   * lay the page out there and then — and the page can hold a table of a few thousand
   * cells. Once per keystroke that is the whole interaction budget; once per frame is
   * invisible, and a burst of typing collapses into a single measurement.
   */
  const resizeComposer = useCallback(() => {
    if (pendingResize.current !== null) return
    pendingResize.current = requestAnimationFrame(() => {
      pendingResize.current = null
      resizeComposerNow()
    })
  }, [resizeComposerNow])

  /**
   * Where Send is. In the row while the message fits on one line; outside the panel,
   * round, once it does not — and also while the panel is closed with something written,
   * which is the only way that message could still be sent.
   *
   * There is no latch: the measurement behind it always asks about the row with Send in
   * it, so erasing back to a message that fits brings Send home, and nothing here can
   * flip on its own.
   */
  const isSendFloating = isComposing && (isOverflowing || panelWidth === 0)

  useEffect(() => {
    // Scroll only the message list's own viewport directly — `scrollIntoView` walks up
    // and can adjust *every* scrollable ancestor's scroll position along the way,
    // including this panel's own outer clipping wrapper (invisible, no scrollbar, but
    // still programmatically scrollable), which visually fights the width transition.
    // A direct, targeted scroll has no such risk.
    const viewport = scrollAreaRef.current?.querySelector<HTMLDivElement>('[data-slot="scroll-area-viewport"]')
    viewport?.scrollTo({ top: viewport.scrollHeight, behavior: 'smooth' })
  }, [messages, status])

  // Before the paint, not after it: a height computed once the frame is already on
  // screen is a height the user watches change.
  useLayoutEffect(() => {
    resizeComposer()
  }, [draft, panelWidth, isSendFloating, resizeComposer])

  isFloatingRef.current = isSendFloating

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
    const observer = new ResizeObserver(() => {
      // Only a width the measurement did not produce is worth measuring again: its own
      // height changes come back here too, and answering them is how a loop starts.
      if (composer.clientWidth === lastMeasuredWidth.current) return
      lastMeasuredWidth.current = composer.clientWidth
      resizeComposer()
    })
    observer.observe(composer)
    return () => observer.disconnect()
  }, [resizeComposer])

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
    if (!draft.trim()) return
    void sendMessage(draft.trim())
    write('')
    // Sent from the closed panel, the message and its reply would land out of sight and
    // the panel would look like it had swallowed them. Sending opens it.
    if (panelWidth === 0) togglePanel()
  }

  // While actively dragging, track the pointer directly instead of the (not-yet-committed)
  // store value, so the panel follows the cursor with no snap-to-minimum until release.
  const liveWidth = dragOffset !== null ? Math.max(0, Math.min(MAX_PANEL_WIDTH, panelWidth - dragOffset)) : panelWidth

  return (
    <>
    {/* Outside the panel, and outside the box that clips it: a message written into a
        panel that is then closed still has somewhere to go — faded but present — and
        sending it brings the button home. */}
    <button
      type="button"
      aria-label={t('panel.send')}
      title={t('panel.send')}
      onClick={submitDraft}
      // Beside the panel rather than a grip's width away from it: the grip is centred
      // vertically and this sits low, so the two never meet. COMPOSER_PADDING is the
      // form's own padding: the box's lower edge, from which the button centres itself
      // on the box however many lines the message has grown to.
      style={{ right: liveWidth + 22, bottom: COMPOSER_PADDING + Math.max(0, (composerHeight - 40) / 2) }}
      className={cn(
        'bg-primary text-primary-foreground fixed z-50 flex size-10 items-center justify-center rounded-full shadow-lg',
        'transition-[opacity,transform] duration-200 ease-out',
        isSendFloating ? 'scale-100 opacity-100' : 'pointer-events-none scale-50 opacity-0',
        // Only while it is actually showing: written unconditionally, this fade wins over
        // the opacity-0 above and leaves the button on screen, smaller, after a send.
        isSendFloating && panelWidth === 0 && 'opacity-60',
      )}
    >
      <SendHorizontal className="size-4" />
    </button>

    {/* The box's real width is GRIP_WIDTH + liveWidth — content is genuinely that wide
        (not a fixed-width panel revealed through a clipping window), so it reflows as
        the width changes, and the grip — the box's first GRIP_WIDTH px — is always
        on-screen, including when the panel itself is fully closed at liveWidth 0.
        overflow-hidden stays as a safety net against any transient horizontal overflow
        during the width transition, not as the sizing mechanism itself. */}
    <div
      className={cn(
        'pointer-events-none fixed inset-y-0 right-0 z-40 flex overflow-hidden',
        dragOffset === null && 'transition-[width] duration-200 ease-out',
      )}
      style={{ width: GRIP_WIDTH + liveWidth }}
    >
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
          'pointer-events-auto absolute top-1/2 left-0 z-10 flex h-16 w-10 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-l-md border border-r-0 select-none active:cursor-grabbing',
          hasUnread ? 'bg-brand' : 'bg-border',
        )}
      >
        <GripVertical className={cn('size-4', hasUnread ? 'text-brand-foreground' : 'text-sidebar-foreground/70')} />
      </div>

      <div
        // Narrower than the minimum, the panel is on its way to closed — releasing there
        // snaps it shut — so the contents stop reflowing and are simply clipped by the box
        // instead. Squeezing a composer and a message list into a width they will never be
        // released at is work nobody sees and layout the user has to watch happen.
        style={{ width: Math.max(liveWidth, MIN_PANEL_WIDTH) }}
        className="pointer-events-auto relative ml-10 flex h-full shrink-0 flex-col border-l bg-sidebar shadow-lg"
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
              {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
              {isSending && (
                <div className="text-muted-foreground flex max-w-[85%] items-center gap-2 self-start rounded-md bg-muted px-3 py-2 text-sm">
                  <Hourglass className="size-4 animate-spin" />
                  {status.type === 'tool'
                    ? t('panel.statusUsingTool', { name: status.name })
                    : t('panel.statusWaiting')}
                  {/* Beside the reply that is holding them up, which is the only place the
                      count answers the question it raises. */}
                  {queued.length > 0 && (
                    <span className="bg-background/60 rounded-full px-2 py-0.5 text-xs">
                      {t('panel.queued', { count: queued.length })}
                    </span>
                  )}
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
                {/* An image says what it is faster than its filename does. */}
                {attachment.kind === 'image' && (
                  <img src={attachment.content} alt="" className="-ml-1.5 size-5 rounded-full object-cover" />
                )}
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
            accept={ACCEPTED_ATTACHMENTS}
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          {/* Send sits at the left of the row until the message outgrows one line, and
              then leaves the row altogether — see the floating button below, which is the
              same action in the place a wrapped message leaves for it. */}
          {!isSendFloating && (
            <Button
              type="submit"
              disabled={!draft.trim()}
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
            {/* Out of flow, invisible, and the same shape as the box: what the message
                would look like at a width the box does not have yet. */}
            <div
              ref={mirrorRef}
              aria-hidden
              style={{ contain: 'layout style' }}
              className="pointer-events-none invisible fixed top-0 -left-[9999px] -z-10 leading-5 break-words whitespace-pre-wrap"
            />
            <Textarea
              ref={composerRef}
              rows={1}
              placeholder={t('panel.inputPlaceholder')}
              value={draft}
              onChange={(e) => write(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  submitDraft()
                }
              }}
              className={cn('min-h-0 resize-none overflow-y-hidden leading-5', !isComposing && 'pr-9')}
            />
            {/* Only while the box is empty: once there is a message, the width belongs to
                the message. Files can still be dragged onto the panel. */}
            {!isComposing && (
              <button
                type="button"
                aria-label={t('panel.attachButton')}
                title={t('panel.attachButton')}
                onClick={() => fileInputRef.current?.click()}
                // Centred rather than pinned to the bottom: the clip only shows while
                // the box is empty, so the box is one line tall and its middle is the
                // only place the icon belongs.
                className="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-0.5"
              >
                <Paperclip className="size-4" />
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
    </>
  )
}

/**
 * One message, memoised.
 *
 * The panel re-renders on every keystroke in the composer — that is what typing is — and
 * without this every message in the conversation would be re-rendered with it, Markdown
 * and all. A message that has been sent never changes, so it never needs redrawing.
 */
const MessageBubble = memo(function MessageBubble({ message }: { message: ChatMessage }) {
  return (
    <div
      className={cn(
        'flex max-w-[85%] min-w-0 flex-col gap-0.5',
        message.role === 'user' ? 'self-end items-end' : 'self-start items-start',
      )}
    >
      {/* Each side says what produced it: the reply names its model, the message names the
          profile it was written under. Both are absent when there is nothing to say. */}
      {message.role === 'assistant' && !message.isError && message.model && (
        <span className="text-muted-foreground px-1 text-[10px]">{message.model}</span>
      )}
      {message.role === 'user' && message.profile && (
        <span className="text-muted-foreground px-1 text-[10px]">Selected profile: {message.profile}</span>
      )}
      <div
        className={cn(
          'max-w-full min-w-0 rounded-md px-3 py-2 text-sm break-words',
          message.isError
            ? 'bg-destructive/10 text-destructive'
            : message.role === 'user'
              ? 'bg-brand text-brand-foreground'
              : 'bg-muted',
        )}
      >
        <MarkdownText content={message.content} tone={message.role} />
        {message.images && message.images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {message.images.map((image) => (
              <img key={image.dataUrl.slice(-24)} src={image.dataUrl} alt={image.name} title={image.name} className="max-h-40 rounded" />
            ))}
          </div>
        )}
      </div>
    </div>
  )
})

/**
 * Model prices run to millionths of a dollar a token, so a session can genuinely cost
 * a fraction of a cent — shown to four decimals until it is worth rounding, since
 * "$0.00" would say the wrong thing about a number that is not zero.
 */
function formatCost(cost: number): string {
  return cost >= 0.01 ? `$${cost.toFixed(2)}` : `$${cost.toFixed(4)}`
}
