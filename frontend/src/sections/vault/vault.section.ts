import { BookOpenCheck, Database, Info } from 'lucide-react'
import type { AppSection } from '../types'
import { AboutPanel } from './about-panel'
import { DataPanel } from './data-panel'

/**
 * Reskinning this: swap the icon below, and the `--brand`/`--brand-foreground`
 * tokens in src/index.css (both :root and .dark). The colored-box styling
 * itself lives in activity-bar.tsx, keyed off `brand: true` below.
 */
export const vaultSection: AppSection = {
  id: 'vault',
  labelKey: 'vault:section.label',
  icon: BookOpenCheck,
  brand: true,
  items: [
    { id: 'data', labelKey: 'vault:items.data', icon: Database, component: DataPanel },
    { id: 'about', labelKey: 'vault:items.about', icon: Info, component: AboutPanel },
  ],
}
