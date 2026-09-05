import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { DEFAULT_INGESTION_GUIDE, INGESTION_GUIDE_KEY } from '@/lib/ingestion-guide'
import { classificationNotesForPrompt } from '@/lib/model/classification-notes'
import { renderPrompt } from '@/lib/prompt-placeholders'
import { promptText } from '@/lib/prompts/registry'
import type { AssistantPrompt } from '@/lib/assistant-prompts'
import type { ToolDefinition } from './types'

export const readIngestionGuideTool: ToolDefinition = {
  name: 'read_ingestion_guide',
  description: "Returns the guide to importing and labelling \u2014 what a source table holds, the order of the work, every label, how signs are made to agree, how corrections are made, who may delete \u2014 followed by the notes written about this particular vault. Call it BEFORE doing or explaining anything about that work. Read-only.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async (_args, context) => {
    const stored = (await assistantPromptsTable.toArray()).find((row) => (row.data as AssistantPrompt).key === INGESTION_GUIDE_KEY)
    // Rendered, never raw: the guide names the sections and screens that exist at this
    // moment, and a saved copy that has lost that placeholder is refused with an
    // explanation rather than sent as if it were still true.
    const saved = stored ? (stored.data as AssistantPrompt).content : DEFAULT_INGESTION_GUIDE
    const guide = renderPrompt(INGESTION_GUIDE_KEY, promptText(INGESTION_GUIDE_KEY, saved), context.translate)
    // The vault's own notes ride along with the guide: one read, and nothing the user
    // wrote about their data can be missed for not having been asked for.
    return `${guide}${await classificationNotesForPrompt()}`
  },
}
