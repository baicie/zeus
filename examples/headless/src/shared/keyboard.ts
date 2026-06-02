export function isEnterOrSpace(event: KeyboardEvent): boolean {
  return event.key === 'Enter' || event.key === ' '
}

export function isArrowKey(event: KeyboardEvent): boolean {
  return (
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight' ||
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown'
  )
}
