import { initDev } from './dev'

if (__DEV__) {
  initDev()
}

export * from '@zeus-js/runtime'
export * from '@zeus-js/wc'
