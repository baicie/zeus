import {
  createZeusRollupPlugin,
  defineZeusRollupConfig,
} from '@zeus-js/bundler-plugin'

export { createZeusRollupPlugin as zeus, defineZeusRollupConfig }
export type { ZeusRollupConfigOptions } from '@zeus-js/bundler-plugin'
export default createZeusRollupPlugin
export * from './index'
