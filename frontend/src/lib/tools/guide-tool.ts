import { assistantPromptsTable } from '@/lib/assistant-prompts-db'
import { DEFAULT_INGESTION_GUIDE, INGESTION_GUIDE_KEY } from '@/lib/ingestion-guide'
import { classificationNotesForPrompt } from '@/lib/model/classification-notes'
import { renderPrompt } from '@/lib/prompt-placeholders'
import type { AssistantPrompt } from '@/lib/assistant-prompts'
import type { ToolDefinition } from './types'

export const readIngestionGuideTool: ToolDefinition = {
  name: 'read_ingestion_guide',
  description: "Returns the complete guide to importing and labelling: what a source table holds, the order the work is done in, every label and what its values mean, how signs are made to agree, how corrections are made, and which actions belong to the user — followed by the notes written about this particular vault, which say what a rule cannot and outrank your own guesswork. Call it BEFORE doing or explaining anything about importing, assigning columns, labelling, signs, rules or confirming — including when the user simply asks for help with any of that. Read-only.",
  parameters: { type: 'object', properties: {}, additionalProperties: false },
  execute: async (_args, context) => {
    const stored = (await assistantPromptsTable.toArray()).find((row) => (row.data as AssistantPrompt).key === INGESTION_GUIDE_KEY)
    // Rendered, never raw: the guide names the sections and screens that exist at this
    // moment, and a saved copy that has lost that placeholder is refused with an
    // explanation rather than sent as if it were still true.
    const guide = renderPrompt(INGESTION_GUIDE_KEY, stored ? (stored.data as AssistantPrompt).content : DEFAULT_INGESTION_GUIDE, context.translate)
    // The vault's own notes ride along with the guide: one read, and nothing the user
    // wrote about their data can be missed for not having been asked for.
    return `${guide}${await classificationNotesForPrompt()}`
  },
}
