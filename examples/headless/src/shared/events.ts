export interface ChangeDetail<T> {
  value: T
}

export interface CheckedChangeDetail {
  checked: boolean | 'indeterminate'
}

export interface OpenChangeDetail {
  open: boolean
}

export function isDisabled(value: unknown): boolean {
  return value === true || value === ''
}
