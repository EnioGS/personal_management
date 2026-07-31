import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function AboutPanel() {
  const { t } = useTranslation('vault')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-medium">{t('about.heading')}</h2>
      <p className="text-muted-foreground max-w-md text-sm">{t('about.description')}</p>
      <a
        href="https://github.com/EnioGS"
        target="_blank"
        rel="noreferrer"
        className="text-brand inline-flex items-center gap-1.5 text-sm font-medium hover:underline"
      >
        {t('about.githubLabel')}
        <ExternalLink className="size-3.5" />
      </a>
    </div>
  )
}
