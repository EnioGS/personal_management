import { BookOpenCheck, Info, Rocket } from 'lucide-react'
import type { AppSection } from '../types'
import { AboutPanel } from './about-panel'
import { GetStartedPanel } from './get-started-panel'

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
    { id: 'getStarted', labelKey: 'vault:items.getStarted', icon: Rocket, component: GetStartedPanel },
    { id: 'about', labelKey: 'vault:items.about', icon: Info, component: AboutPanel },
  ],
}
