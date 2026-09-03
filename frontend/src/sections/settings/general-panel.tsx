import { Monitor, Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/lib/locale'
import { useLocaleStore } from '@/store/locale-store'
import { useThemeStore, type Theme } from '@/store/theme-store'

const options: { value: Locale; labelKey: string }[] = [
  { value: 'pt', labelKey: 'general.portuguese' },
  { value: 'en', labelKey: 'general.english' },
]

/** Theme lives here rather than in a screen of its own: it is one three-way choice. */
const themes: { value: Theme; labelKey: string; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'appearance.light', icon: Sun },
  { value: 'dark', labelKey: 'appearance.dark', icon: Moon },
  { value: 'system', labelKey: 'appearance.system', icon: Monitor },
]

export function GeneralPanel() {
  const { t } = useTranslation('settings')
  const { locale, setLocale } = useLocaleStore()
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{t('general.languageLabel')}</p>
        <div className="inline-flex rounded-md border p-1">
          {options.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={locale === option.value ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={locale === option.value}
              onClick={() => setLocale(option.value)}
            >
              {t(option.labelKey as never)}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-muted-foreground mb-2 text-sm">{t('appearance.themeLabel')}</p>
        <div className="inline-flex rounded-md border p-1">
          {themes.map((option) => (
            <Button
              key={option.value}
              type="button"
              variant={theme === option.value ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={theme === option.value}
              onClick={() => setTheme(option.value)}
              className="gap-1.5"
            >
              <option.icon className="size-4" />
              {t(option.labelKey as never)}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
