import 'i18next'
import type common from '@/locales/common/en.json'
import type notes from '@/sections/notes/locales/en.json'
import type settings from '@/sections/settings/locales/en.json'

// Type-checks t() calls against the English resources (the source of truth
// for key shape — pt.json files must match the same structure).
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common'
    resources: {
      common: typeof common
      notes: typeof notes
      settings: typeof settings
    }
  }
}
