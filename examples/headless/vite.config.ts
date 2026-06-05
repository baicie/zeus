import zeus from '@zeus-js/bundler-plugin/vite'
import { componentLibrary } from '@zeus-js/preset-component-library'

export default {
  plugins: [
    zeus({
      plugins: componentLibrary(),
    }),
  ],

  build: {
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
}
