import { defineConfig } from 'rolldown'
import zeus from '@zeus-js/bundler-plugin/rolldown'
import { componentLibrary } from '@zeus-js/preset-component-library'

export default defineConfig({
  input: 'src/index.ts',

  output: {
    dir: 'dist',
    format: 'esm',
    preserveModules: false,
    entryFileNames: '[name].js',
    chunkFileNames: 'assets/[name]-[hash].js',
    manualChunks(id) {
      if (
        id.includes('@zeus-js/runtime-dom') ||
        id.includes('@zeus-js/signal') ||
        id.includes('@zeus-js/zeus')
      ) {
        return 'zeus-runtime'
      }
    },
  },

  plugins: [
    zeus({
      plugins: componentLibrary({
        styles: 'src/styles.css',
        targets: ['wc', 'react', 'vue'],
        dts: false,
        manifest: true,
        customElements: true,
      }),
    }),
  ],

  external: [
    /^react$/,
    /^react-dom$/,
    /^vue$/,
    /^@zeus-js\//,
  ],

  onwarn(warning, warn) {
    if (warning.code === 'UNRESOLVED_IMPORT') return
    warn(warning)
  },
})
