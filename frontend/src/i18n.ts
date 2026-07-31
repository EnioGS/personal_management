import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { readInitialLocale } from '@/lib/locale'

import commonEn from '@/locales/common/en.json'
import commonPt from '@/locales/common/pt.json'
import financesEn from '@/sections/finances/locales/en.json'
import financesPt from '@/sections/finances/locales/pt.json'
import investmentsEn from '@/sections/investments/locales/en.json'
import investmentsPt from '@/sections/investments/locales/pt.json'
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
    en: { common: commonEn, notes: notesEn, finances: financesEn, investments: investmentsEn, settings: settingsEn },
    pt: { common: commonPt, notes: notesPt, finances: financesPt, investments: investmentsPt, settings: settingsPt },
  },
  ns: ['common', 'notes', 'finances', 'investments', 'settings'],
  defaultNS: 'common',
  lng: readInitialLocale(),
  fallbackLng: 'pt',
  interpolation: {
    escapeValue: false, // React already escapes.
  },
})

export default i18next
