import { Sparkle } from 'lucide-react'

/**
 * Reskinning this template for a real product identity: swap the `Sparkle`
 * icon below, and the `--brand`/`--brand-foreground` tokens in src/index.css
 * (both :root and .dark). Nothing else needs to change.
 */
export function BrandMark() {
  return (
    <div
      aria-hidden
      className="mb-2 flex size-[3.375rem] shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground"
    >
      <Sparkle className="size-[1.875rem]" />
    </div>
  )
}
