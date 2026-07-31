import { useTranslation } from 'react-i18next'

interface PlaceholderPanelProps {
  title: string
}

export function PlaceholderPanel({ title }: PlaceholderPanelProps) {
  const { t } = useTranslation('common')
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
      <h2 className="text-sm font-medium">{title}</h2>
      <p className="text-muted-foreground text-sm">{t('comingSoon')}</p>
    </div>
  )
}
