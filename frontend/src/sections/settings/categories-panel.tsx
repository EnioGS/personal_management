import { useState } from 'react'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useCategoriesStore, useCategoryRulesStore } from '@/lib/model/model-stores'
import { useEntriesStore, useEntryLabelsStore } from '@/lib/model/model-stores'
import { labelCoverage } from '@/lib/model/label-coverage'
import { useCategoryRawValues } from '@/lib/model/use-unclassified-values'

export function CategoriesPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <UnclassifiedSection />
      <CategoriesSection />
      <RulesSection />
    </div>
  )
}

/** Every raw category value found in the data, with the rule that currently owns it. */
function UnclassifiedSection() {
  const { t } = useTranslation('settings')
  const rawValues = useCategoryRawValues()

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{t('categories.rawValuesHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('categories.rawValuesDescription')}</p>
      </div>
      <div className="flex max-h-72 flex-col divide-y overflow-y-auto rounded-md border">
        {rawValues.length === 0 ? (
          <p className="text-muted-foreground p-3 text-xs">{t('categories.noRawValues')}</p>
        ) : rawValues.map(({ value, count, matchingStrings, unmatched }) => (
          <div key={value} className="flex items-center justify-between gap-3 p-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm" title={value}>{value}</p>
              <p className="text-muted-foreground text-xs">{t('categories.rawValueCount', { count })}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-xs">
              {matchingStrings.length > 0 && (
                <div className="flex max-w-64 flex-wrap justify-end gap-1" title={matchingStrings.join(', ')}>
                  {matchingStrings.map((matchingString) => (
                    <span key={matchingString} className="bg-muted rounded px-1.5 py-0.5 font-mono">
                      {matchingString}
                    </span>
                  ))}
                </div>
              )}
              {unmatched && (
                <span className="border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded border px-1.5 py-0.5 font-medium">
                  {t('categories.unmatched')}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function CategoriesSection() {
  const { t } = useTranslation('settings')
  const categories = useCategoriesStore((s) => s.items)
  const addCategory = useCategoriesStore((s) => s.addItem)
  const rules = useCategoryRulesStore((s) => s.items)
  const addRule = useCategoryRulesStore((s) => s.addItem)
  const [name, setName] = useState('')
  const [matchString, setMatchString] = useState('')

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{t('categories.categoriesHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('categories.categoriesDescription')}</p>
      </div>

      <form
        className="grid items-end gap-2 sm:grid-cols-[1fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault()
          const trimmedName = name.trim()
          const trimmedMatchString = matchString.trim()
          if (!trimmedName || !trimmedMatchString) return
          const existingCategory = categories.find((category) => category.name.toLowerCase() === trimmedName.toLowerCase())
          const categoryId = existingCategory?.id ?? await addCategory({ name: trimmedName })
          const nextPriority = rules.length > 0 ? Math.max(...rules.map((r) => r.priority)) + 1 : 0
          await addRule({ categoryId, match: 'contains', pattern: trimmedMatchString, priority: nextPriority })
          setName('')
          setMatchString('')
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">{t('categories.categoryName')}</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium">{t('categories.matchString')}</span>
          <Input value={matchString} onChange={(e) => setMatchString(e.target.value)} className="h-8" />
        </label>
        <Button type="submit" size="sm" disabled={!name.trim() || !matchString.trim()}>
          {t('categories.addCategory')}
        </Button>
      </form>

    </section>
  )
}

function RulesSection() {
  const { t } = useTranslation('settings')
  const rules = useCategoryRulesStore((s) => s.items)
  const updateRule = useCategoryRulesStore((s) => s.updateItem)
  const deleteRule = useCategoryRulesStore((s) => s.deleteItem)
  const categories = useCategoriesStore((s) => s.items)
  const entries = useEntriesStore((s) => s.items)
  const entryLabels = useEntryLabelsStore((s) => s.items)
  const coverage = labelCoverage(entries, entryLabels)

  const sorted = [...rules].sort((a, b) => a.priority - b.priority)

  function categoryName(id: number) {
    return categories.find((c) => c.id === id)?.name ?? '—'
  }

  // Swaps this rule's priority with its neighbor — the whole point of priority is
  // "first match wins" order, so moving a rule only ever needs to change where it sits
  // relative to the one beside it, never a full renumbering of the list.
  function move(rule: (typeof sorted)[number], direction: -1 | 1) {
    const index = sorted.findIndex((r) => r.id === rule.id)
    const neighbor = sorted[index + direction]
    if (!neighbor) return
    const { id, createdAt: _a, ...ruleRest } = rule
    const { id: neighborId, createdAt: _b, ...neighborRest } = neighbor
    void updateRule(id, { ...ruleRest, priority: neighbor.priority })
    void updateRule(neighborId, { ...neighborRest, priority: rule.priority })
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{t('categories.rulesHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('categories.rulesDescription')}</p>
        <p className="text-muted-foreground mt-1 text-xs">{t('categories.legacyCoverage', { ...coverage })}</p>
      </div>

      {sorted.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('categories.noRules')}</p>
      ) : (
        <div className="flex flex-col divide-y rounded-md border">
          {sorted.map((rule, index) => (
            <div key={rule.id} className="flex items-center justify-between gap-2 p-2">
              <div className="min-w-0 text-sm">
                <span className="text-muted-foreground">{t(`categories.matchTypes.${rule.match}` as never)}</span>{' '}
                <span className="font-mono text-xs">"{rule.pattern}"</span>
                {' → '}
                <span className="font-medium">{categoryName(rule.categoryId)}</span>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('categories.moveUp')}
                  disabled={index === 0}
                  onClick={() => move(rule, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t('categories.moveDown')}
                  disabled={index === sorted.length - 1}
                  onClick={() => move(rule, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={t('categories.deleteRule')}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('categories.deleteRuleDialogTitle')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('categories.deleteRuleDialogDescription')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('accountsCards.cancel')}</AlertDialogCancel>
                      <AlertDialogAction variant="destructive" onClick={() => void deleteRule(rule.id)}>
                        {t('categories.deleteRule')}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
