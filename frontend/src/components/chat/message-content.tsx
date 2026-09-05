import { memo, useMemo } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/**
 * A chat message, rendered as the Markdown it is written in.
 *
 * Models answer in Markdown whether or not anyone asked — headings, tables, fenced
 * code, task lists — and showing the source meant reading `**bold**` and losing the
 * shape of every list and table. The same goes for what the user writes: pasting a
 * table into the composer should look like a table on both sides of the conversation.
 *
 * Everything is styled explicitly rather than through a prose plugin, because these
 * bubbles are small, coloured, and have to read on the user's own accent colour as
 * well as on the muted assistant background — so type sizes come from the bubble, and
 * only structure comes from the Markdown.
 */
function MessageContentView({ content, tone }: { content: string; tone: 'user' | 'assistant' }) {
  // On the accent-coloured user bubble every part has to inherit that foreground;
  // borders and code backgrounds lean on the current colour instead of the palette.
  const subtle = tone === 'user' ? 'border-current/25 bg-current/10' : 'border-border bg-background/60'

  // Built once per tone rather than per render: a new object here is a new set of
  // components for the renderer to reconcile against, every time.
  const components = useMemo((): Components => ({
          p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
          h1: ({ children }) => <p className="mt-1 text-base font-semibold">{children}</p>,
          h2: ({ children }) => <p className="mt-1 font-semibold">{children}</p>,
          h3: ({ children }) => <p className="mt-1 font-semibold">{children}</p>,
          h4: ({ children }) => <p className="mt-1 font-medium">{children}</p>,
          ul: ({ children }) => <ul className="list-disc space-y-0.5 pl-4">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal space-y-0.5 pl-4">{children}</ol>,
          li: ({ children }) => <li className="whitespace-pre-wrap">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          del: ({ children }) => <del className="opacity-70">{children}</del>,
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer noopener" className="underline underline-offset-2">
              {children}
            </a>
          ),
          blockquote: ({ children }) => <blockquote className={cn('border-l-2 pl-3 opacity-90', subtle.split(' ')[0])}>{children}</blockquote>,
          hr: () => <hr className={cn('my-1', subtle.split(' ')[0])} />,
          code: ({ className, children }) => {
            // A fenced block arrives with a language class; anything else is inline.
            const isBlock = typeof className === 'string' && className.includes('language-')
            return isBlock
              ? <code className="block font-mono text-xs">{children}</code>
              : <code className={cn('rounded px-1 py-0.5 font-mono text-[0.85em]', subtle)}>{children}</code>
          },
          pre: ({ children }) => <pre className={cn('overflow-x-auto rounded-md border p-2', subtle)}>{children}</pre>,
          // Wide tables scroll inside the bubble rather than stretching the panel.
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className={cn('border-b', subtle.split(' ')[0])}>{children}</thead>,
          th: ({ children }) => <th className="px-1.5 py-1 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className={cn('border-t px-1.5 py-1 align-top', subtle.split(' ')[0])}>{children}</td>,
    input: ({ checked, type }) =>
      type === 'checkbox' ? <input type="checkbox" checked={checked} readOnly className="mr-1 align-middle" /> : null,
  }), [subtle])

  return (
    <div className="flex flex-col gap-2 text-sm break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

/**
 * Memoised, because rendering Markdown means parsing it.
 *
 * Every keystroke in the composer re-renders the panel around these, and without this
 * each message would be parsed again on every one — a conversation of twenty answers is
 * twenty documents rebuilt per character typed, which is felt as the typing itself being
 * slow.
 */
export const MessageContent = memo(MessageContentView)
