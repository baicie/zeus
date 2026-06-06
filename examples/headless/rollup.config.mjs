import { componentLibrary, defineZeusRollupConfig } from '@zeus-js/web-c/rollup'

export default defineZeusRollupConfig({
  zeus: {
    plugins: componentLibrary(),
  },
})
