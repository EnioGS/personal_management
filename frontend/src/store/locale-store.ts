import { create } from 'zustand'
import i18n from '@/i18n'
import { LOCALE_STORAGE_KEY, readInitialLocale, type Locale } from '@/lib/locale'

interface LocaleState {
  locale: Locale
  setLocale: (locale: Locale) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: readInitialLocale(),
  setLocale: (locale) => {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale)
    void i18n.changeLanguage(locale)
    set({ locale })
  },
}))
