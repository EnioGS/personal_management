export type Locale = 'pt' | 'en'

/** Keep in sync with usage in src/i18n.ts and src/store/locale-store.ts. */
export const LOCALE_STORAGE_KEY = 'locale'

export function readInitialLocale(): Locale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY)
  return stored === 'en' ? 'en' : 'pt'
}

/** BCP47 tags for Intl formatting (dates, numbers) — more precise than the bare app-level codes. */
export const INTL_LOCALE_TAG: Record<Locale, string> = {
  pt: 'pt-BR',
  en: 'en-US',
}
