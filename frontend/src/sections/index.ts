import type { AppSection } from './types'
import { notesSection } from './notes/notes.section'
import { settingsSection } from './settings/settings.section'

/** Adding a feature = a new folder under src/sections/ + one entry here. */
export const sections: AppSection[] = [notesSection, settingsSection]
