export * from '@zeus-js/runtime-core'

export * from '@zeus-js/signal'

export * from '@zeus-js/web-components'

export const version = '__VERSION__'

export const framework = {
  name: 'Zeus',
  version: '__VERSION__',
  description: 'A modern reactive framework built with Rust and TypeScript',
}

import type { App } from '@zeus-js/runtime-core'
import { renderer } from '@zeus-js/runtime-dom'

export function createApp(rootComponent: any): App {
  return renderer.createApp(rootComponent)
}

export { createApp as createCoreApp } from '@zeus-js/runtime-core'

export { renderer } from '@zeus-js/runtime-dom'
