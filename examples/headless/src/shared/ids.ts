let uid = 0

export function createId(prefix = 'z'): string {
  uid += 1
  return `${prefix}-${uid}`
}
