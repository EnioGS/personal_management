import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import type { Locale } from '@/lib/locale'
import { useLocaleStore } from '@/store/locale-store'

const options: { value: Locale; labelKey: string }[] = [
  { value: 'pt', labelKey: 'general.portuguese' },
  { value: 'en', labelKey: 'general.english' },
]

export function GeneralPanel() {
  const { t } = useTranslation('settings')
  const { locale, setLocale } = useLocaleStore()

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <h2 className="text-sm font-medium">{t('general.heading')}</h2>
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
    </div>
  )
}
