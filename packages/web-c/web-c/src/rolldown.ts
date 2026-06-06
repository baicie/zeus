import {
  createZeusRolldownPlugin,
  defineZeusRolldownConfig,
} from '@zeus-js/bundler-plugin'

export { createZeusRolldownPlugin as zeus, defineZeusRolldownConfig }
export type { ZeusRolldownConfigOptions } from '@zeus-js/bundler-plugin'
export default createZeusRolldownPlugin
export * from './index'
