import zeus from '@zeus-js/bundler-plugin/vite'
import { componentLibrary } from '@zeus-js/preset-component-library'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      plugins: componentLibrary(),
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
    },
  },
})
