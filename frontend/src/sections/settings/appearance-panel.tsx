import { Moon, Sun, Monitor } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { useThemeStore, type Theme } from '@/store/theme-store'

const options: { value: Theme; labelKey: string; icon: typeof Sun }[] = [
  { value: 'light', labelKey: 'appearance.light', icon: Sun },
  { value: 'dark', labelKey: 'appearance.dark', icon: Moon },
  { value: 'system', labelKey: 'appearance.system', icon: Monitor },
]

export function AppearancePanel() {
  const { t } = useTranslation('settings')
  const { theme, setTheme } = useThemeStore()

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div>
        <p className="mb-2 text-sm text-muted-foreground">{t('appearance.themeLabel')}</p>
        <div className="inline-flex rounded-md border p-1">
          {options.map((option) => (
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
