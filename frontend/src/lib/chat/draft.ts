/**
 * What is typed and not yet sent, kept where a reload cannot take it.
 *
 * A message someone is halfway through writing is work, and losing it to a stray reload
 * or a click on another screen is the kind of small loss that teaches people not to trust
 * a text box. Kept per conversation, because switching to another and back should find the
 * sentence where it was left rather than in the wrong thread.
 *
 * localStorage rather than the vault: a draft is not data about anybody's money, and it
 * has no business travelling in an export or being restored onto another machine.
 */
const KEY = 'chatDrafts'
/** A draft written before the conversation exists belongs to the one about to. */
const UNSTARTED = 'new'

function read(): Record<string, string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return stored && typeof stored === 'object' ? (stored as Record<string, string>) : {}
  } catch {
    return {}
  }
}

export function readDraft(conversationId: number | null): string {
  return read()[conversationId === null ? UNSTARTED : String(conversationId)] ?? ''
}

export function writeDraft(conversationId: number | null, text: string): void {
  const key = conversationId === null ? UNSTARTED : String(conversationId)
  const drafts = read()
  // An emptied box is not a draft: leaving "" behind would keep every conversation ever
  // typed into in the record forever.
  if (text.trim()) drafts[key] = text
  else delete drafts[key]
  try { localStorage.setItem(KEY, JSON.stringify(drafts)) } catch { /* a full quota loses a draft, not the message */ }
}

/**
 * Moves the unstarted draft onto the conversation it became.
 *
 * The first message of a conversation is typed before the conversation exists, so what was
 * saved under "new" belongs to whichever id it turned into — otherwise a draft written,
 * abandoned, and returned to after the first send would come back on the wrong thread.
 */
export function adoptDraft(conversationId: number): void {
  const drafts = read()
  if (!drafts[UNSTARTED]) return
  drafts[String(conversationId)] = drafts[UNSTARTED]
  delete drafts[UNSTARTED]
  try { localStorage.setItem(KEY, JSON.stringify(drafts)) } catch { /* see above */ }
}
