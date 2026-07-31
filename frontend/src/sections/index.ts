import type { AppSection } from './types'
import { financesSection } from './finances/finances.section'
import { investmentsSection } from './investments/investments.section'
import { notesSection } from './notes/notes.section'
import { settingsSection } from './settings/settings.section'

/** Adding a feature = a new folder under src/sections/ + one entry here. */
export const sections: AppSection[] = [financesSection, investmentsSection, notesSection, settingsSection]
