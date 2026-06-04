import zeus from '@zeus-js/bundler-plugin/rollup'
import { componentLibrary } from '@zeus-js/preset-component-library'
import { nodeResolve } from '@rollup/plugin-node-resolve'

export default {
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
        dts: true,
        jsxDts: true,
        manifest: true,
        customElements: true,
      }),
    }),
    nodeResolve({
      extensions: ['.ts', '.tsx', '.js', '.jsx'],
    }),
  ],

  external: [/^react$/, /^react-dom$/, /^vue$/, /^@zeus-js\//],
}
