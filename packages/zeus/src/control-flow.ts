export function Show(_: any): never {
  throw new Error(
    'Show is a compile-time built-in and should not run directly.',
  )
}

export function For(_: any): never {
  throw new Error('For is a compile-time built-in and should not run directly.')
}
