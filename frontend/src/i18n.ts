import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readInitialLocale } from '@/lib/locale'

import commonEn from '@/locales/common/en.json'
import commonPt from '@/locales/common/pt.json'
import notesEn from '@/sections/notes/locales/en.json'
import notesPt from '@/sections/notes/locales/pt.json'
import settingsEn from '@/sections/settings/locales/en.json'
import settingsPt from '@/sections/settings/locales/pt.json'

/**
 * Adding a section with its own translated strings: create its
 * locales/{en,pt}.json (see src/sections/notes/locales/ for the shape),
 * then register both here — resources and the `ns` list below.
 */
void i18next.use(initReactI18next).init({
  resources: {
    en: { common: commonEn, notes: notesEn, settings: settingsEn },
    pt: { common: commonPt, notes: notesPt, settings: settingsPt },
  },
  ns: ['common', 'notes', 'settings'],
  defaultNS: 'common',
  lng: readInitialLocale(),
  fallbackLng: 'pt',
  interpolation: {
    escapeValue: false, // React already escapes.
  },
})

export default i18next
