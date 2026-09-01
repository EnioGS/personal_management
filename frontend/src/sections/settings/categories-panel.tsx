import { useState } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from 'lucide-react'
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useCategoriesStore, useCategoryRulesStore } from '@/lib/model/model-stores'
import type { CategoryMatch } from '@/lib/model/types'
import { useUnclassifiedValues } from '@/lib/model/use-unclassified-values'

const MATCH_TYPES: CategoryMatch[] = ['contains', 'equals', 'startsWith', 'regex']

export function CategoriesPanel() {
  return (
    <div className="flex h-full flex-col gap-6 overflow-auto p-4">
      <UnclassifiedSection />
      <CategoriesSection />
      <RulesSection />
    </div>
  )
}

/** New values found in the data with no rule pointing at them — promote or assign in one click. */
function UnclassifiedSection() {
  const { t } = useTranslation('settings')
  const unclassified = useUnclassifiedValues()
  const categories = useCategoriesStore((s) => s.items)
  const addCategory = useCategoriesStore((s) => s.addItem)
  const addRule = useCategoryRulesStore((s) => s.addItem)
  const rules = useCategoryRulesStore((s) => s.items)
  const [assigningTo, setAssigningTo] = useState<Record<string, string>>({})

  const nextPriority = rules.length > 0 ? Math.max(...rules.map((r) => r.priority)) + 1 : 0

  async function promote(value: string) {
    const categoryId = await addCategory({ name: value })
    await addRule({ categoryId, match: 'equals', pattern: value, priority: nextPriority })
  }

  async function assign(value: string, categoryId: number) {
    await addRule({ categoryId, match: 'equals', pattern: value, priority: nextPriority })
  }

  if (unclassified.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{t('categories.unclassifiedHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('categories.unclassifiedDescription')}</p>
      </div>
      <div className="flex flex-col divide-y rounded-md border">
        {unclassified.map(({ value, count }) => (
          <div key={value} className="flex items-center justify-between gap-2 p-2">
            <div className="min-w-0">
              <p className="truncate text-sm">{value}</p>
              <p className="text-muted-foreground text-xs">{t('categories.unclassifiedCount', { count })}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {categories.length > 0 && (
                <Select value={assigningTo[value] ?? ''} onValueChange={(v) => setAssigningTo((a) => ({ ...a, [value]: v }))}>
                  <SelectTrigger size="sm" className="h-7 w-36 text-xs">
                    <SelectValue placeholder={t('categories.assignToExisting')} />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                type="button"
                variant="outline"
                size="xs"
                disabled={!assigningTo[value]}
                onClick={() => void assign(value, Number(assigningTo[value]))}
              >
                <Check className="size-3.5" />
                {t('categories.assign')}
              </Button>
              <Button type="button" variant="outline" size="xs" onClick={() => void promote(value)}>
                <Plus className="size-3.5" />
                {t('categories.promote')}
              </Button>
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
  const deleteCategory = useCategoriesStore((s) => s.deleteItem)
  const rules = useCategoryRulesStore((s) => s.items)
  const deleteRules = useCategoryRulesStore((s) => s.deleteItems)
  const [draft, setDraft] = useState('')

  async function handleDelete(categoryId: number) {
    // A rule pointing at a deleted category is inert (the resolver skips it) but is
    // clutter left behind for no reason, so it goes with the category it names.
    const orphaned = rules.filter((r) => r.categoryId === categoryId).map((r) => r.id)
    if (orphaned.length > 0) await deleteRules(orphaned)
    await deleteCategory(categoryId)
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">{t('categories.categoriesHeading')}</h2>
        <p className="text-muted-foreground text-xs">{t('categories.categoriesDescription')}</p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (!draft.trim()) return
          void addCategory({ name: draft.trim() })
          setDraft('')
        }}
      >
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('categories.newCategoryPlaceholder')}
          className="h-8"
        />
        <Button type="submit" size="sm" disabled={!draft.trim()}>
          {t('categories.addCategory')}
        </Button>
      </form>

      {categories.length === 0 ? (
        <p className="text-muted-foreground rounded-md border border-dashed p-3 text-xs">{t('categories.noCategories')}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((category) => (
            <span key={category.id} className="bg-muted flex items-center gap-1 rounded-full py-1 pr-1 pl-2.5 text-xs">
              {category.name}
              <button
                type="button"
                aria-label={t('categories.deleteCategory', { name: category.name })}
                onClick={() => void handleDelete(category.id)}
                className="hover:bg-background/60 rounded-full p-0.5"
              >
                <Trash2 className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

function RulesSection() {
  const { t } = useTranslation('settings')
  const rules = useCategoryRulesStore((s) => s.items)
  const updateRule = useCategoryRulesStore((s) => s.updateItem)
  const deleteRule = useCategoryRulesStore((s) => s.deleteItem)
  const addRule = useCategoryRulesStore((s) => s.addItem)
  const categories = useCategoriesStore((s) => s.items)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [pattern, setPattern] = useState('')
  const [match, setMatch] = useState<CategoryMatch>('contains')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [categoryId, setCategoryId] = useState('')

  const sorted = [...rules].sort((a, b) => a.priority - b.priority)

  function categoryName(id: number) {
    return categories.find((c) => c.id === id)?.name ?? '—'
  }

  function reset() {
    setPattern('')
    setMatch('contains')
    setCaseSensitive(false)
    setCategoryId('')
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium">{t('categories.rulesHeading')}</h2>
          <p className="text-muted-foreground text-xs">{t('categories.rulesDescription')}</p>
        </div>
        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) reset()
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" size="xs" disabled={categories.length === 0}>
              <Plus className="size-3.5" />
              {t('categories.addRule')}
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('categories.addRule')}</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('categories.rulePattern')}</span>
                <Input value={pattern} onChange={(e) => setPattern(e.target.value)} autoFocus />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('categories.ruleMatch')}</span>
                <Select value={match} onValueChange={(v) => setMatch(v as CategoryMatch)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATCH_TYPES.map((option) => (
                      <SelectItem key={option} value={option}>
                        {t(`categories.matchTypes.${option}` as never)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex items-center gap-2">
                <Button
                  type="button"
                  variant={caseSensitive ? 'secondary' : 'outline'}
                  size="sm"
                  aria-pressed={caseSensitive}
                  onClick={() => setCaseSensitive((v) => !v)}
                >
                  {t('categories.caseSensitive')}
                </Button>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-medium">{t('categories.ruleCategory')}</span>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            </div>
            <DialogFooter>
              <Button
                type="button"
                disabled={!pattern.trim() || !categoryId}
                onClick={() => {
                  const nextPriority = rules.length > 0 ? Math.max(...rules.map((r) => r.priority)) + 1 : 0
                  void addRule({
                    categoryId: Number(categoryId),
                    match,
                    pattern: pattern.trim(),
                    caseSensitive: caseSensitive || undefined,
                    priority: nextPriority,
                  })
                  setDialogOpen(false)
                  reset()
                }}
              >
                {t('categories.addRuleConfirm')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
