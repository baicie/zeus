import { defineConfig } from 'rolldown'
import zeus, { componentLibrary } from '@zeus-js/web-c/rolldown'

export default defineConfig({
  input: 'src/index.ts',
  output: {
    format: 'esm',
  },
  plugins: [
    zeus({
      plugins: componentLibrary({
        styles: false,
      }),
    }),
  ],
})
