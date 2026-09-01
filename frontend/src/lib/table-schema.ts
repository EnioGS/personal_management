export interface ColumnDef<T> {
  key: keyof T
  /** i18next key, "namespace:key" form — used for both the table header and the draft-row input. */
  labelKey: string
  /**
   * 'select' is a closed set the value must belong to (buy/sell). 'combobox' is an open
   * one — free text, with `options` offered as suggestions rather than enforced — for
   * user-owned vocabularies like categories, which grow as data is entered or imported.
   */
  type: 'date' | 'text' | 'number' | 'select' | 'combobox'
  /** Allowed values for 'select'; merely suggested starting values for 'combobox'. */
  options?: readonly string[]
  format?: (value: T[keyof T]) => string
  /** 'text' columns are optional (empty allowed) unless this is set — date/number/select are always required. */
  required?: boolean
}

export type TableSchema<T> = ColumnDef<T>[]
