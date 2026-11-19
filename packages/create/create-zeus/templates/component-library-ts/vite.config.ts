import zeus, { componentLibrary } from '@zeus-js/web-c/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
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
})
