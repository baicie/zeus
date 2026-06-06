import zeus, { componentLibrary } from '@zeus-js/web-c/vite'

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
