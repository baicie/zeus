import { defineZeusRollupConfig } from '@zeus-js/bundler-plugin/rollup'
import { componentLibrary } from '@zeus-js/preset-component-library'

export default defineZeusRollupConfig({
  zeus: {
    plugins: componentLibrary(),
  },
})
