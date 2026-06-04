import { defineZeusRolldownConfig } from '@zeus-js/bundler-plugin/rolldown'
import { componentLibrary } from '@zeus-js/preset-component-library'

export default defineZeusRolldownConfig({
  zeus: {
    plugins: componentLibrary(),
  },
})
