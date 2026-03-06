export * from '@zeus-js/runtime-dom'

export const version = '__VERSION__'

export const framework = {
  name: 'Zeus',
  version: '__VERSION__',
  description: 'A modern reactive framework built with Rust and TypeScript',
}

import { createApp as runtimeDomCreateApp } from '@zeus-js/runtime-dom'
import type { App } from '@zeus-js/runtime-core'

export function createApp(rootComponent: any): App {
  return runtimeDomCreateApp(rootComponent)
}
