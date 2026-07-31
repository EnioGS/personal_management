export interface ColumnDef<T> {
  key: keyof T
  /** i18next key, "namespace:key" form — used for both the table header and the add-row form label. */
  labelKey: string
  type: 'date' | 'text' | 'number' | 'select'
  /** Fixed dropdown values, for type: 'select' columns (category/source/destination/buy-sell). */
  options?: readonly string[]
  format?: (value: T[keyof T]) => string
  /** 'text' columns are optional (empty allowed) unless this is set — date/number/select are always required. */
  required?: boolean
}

export type TableSchema<T> = ColumnDef<T>[]
