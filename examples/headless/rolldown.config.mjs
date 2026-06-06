import {
  componentLibrary,
  defineZeusRolldownConfig,
} from '@zeus-js/web-c/rolldown'

export default defineZeusRolldownConfig({
  zeus: {
    plugins: componentLibrary(),
  },
})
