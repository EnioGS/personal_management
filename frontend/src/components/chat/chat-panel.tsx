import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type PointerEvent } from 'react'
import { GripVertical, Hourglass, Paperclip, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
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
  const clearMessages = useChatStore((s) => s.clearMessages)
  const attachments = useChatStore((s) => s.attachments)
  const addAttachment = useChatStore((s) => s.addAttachment)
  const removeAttachment = useChatStore((s) => s.removeAttachment)
  const pushError = useChatStore((s) => s.pushError)

  const [draft, setDraft] = useState('')
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
    composer.style.height = `${Math.min(composer.scrollHeight, maxHeight)}px`
    composer.style.overflowY = composer.scrollHeight > maxHeight ? 'auto' : 'hidden'
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
          'pointer-events-auto absolute top-1/2 left-0 z-10 flex h-32 w-7 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-l-md border border-r-0 select-none active:cursor-grabbing',
          hasUnread ? 'bg-brand' : 'bg-border',
        )}
      >
        <GripVertical className={cn('size-4', hasUnread ? 'text-brand-foreground' : 'text-sidebar-foreground/70')} />
      </div>

      <div
        className="pointer-events-auto relative ml-7 flex h-full min-w-0 flex-1 flex-col border-l bg-sidebar shadow-lg"
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
                    {message.content}
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

        <form
          className={cn('flex items-end gap-2 p-3', attachments.length === 0 && 'border-t')}
          onSubmit={(e) => {
            e.preventDefault()
            submitDraft()
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('panel.attachButton')}
            onClick={() => fileInputRef.current?.click()}
            className="shrink-0"
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t('panel.clearHistory')}
            disabled={messages.length === 0}
            onClick={() => clearMessages()}
            className="shrink-0"
          >
            <Trash2 className="size-4" />
          </Button>
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
            className="[field-sizing:fixed] min-h-0 resize-none overflow-y-hidden leading-5"
          />
          <Button type="submit" disabled={!draft.trim() || isSending} className="shrink-0">
            {t('panel.send')}
          </Button>
        </form>
      </div>
    </div>
  )
}
