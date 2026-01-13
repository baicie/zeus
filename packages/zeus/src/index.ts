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

export function createApp(rootComponent: any): App {
  // 纯函数式实现，暂时返回空的 App 对象
  return {
    mount() {
      /* TODO */
    },
    unmount() {
      /* TODO */
    },
  }
}

export { createApp as createCoreApp } from '@zeus-js/runtime-core'
