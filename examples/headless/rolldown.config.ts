import { defineConfig } from 'rolldown'
import zeus from '@zeus-js/bundler-plugin/rolldown'
import wc from '@zeus-js/output-wc'
import reactWrapper from '@zeus-js/output-react-wrapper'
import vueWrapper from '@zeus-js/output-vue-wrapper'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    format: 'esm',
  },
  plugins: [
    zeus({
      plugins: [wc(), reactWrapper(), vueWrapper()],
    }),
  ],
})
