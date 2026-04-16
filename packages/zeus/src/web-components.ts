export { defineElement } from '@zeusjs/runtime-wc'

export function Host(_: any): never {
  throw new Error(
    'Host is a compile-time built-in and should not run directly.',
  )
}

export function Slot(_: any): never {
  throw new Error(
    'Slot is a compile-time built-in and should not run directly.',
  )
}
