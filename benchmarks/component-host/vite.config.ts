// benchmarks/component-host/vite.config.ts

import zeus from '@zeus-js/bundler-plugin/vite'
import react from '@zeus-js/output-react-wrapper'
import vue from '@zeus-js/output-vue-wrapper'
import wc from '@zeus-js/output-wc'
import { defineConfig } from 'vite'

const mode = process.env.ZEUS_BENCH_OUTPUTS ?? 'all'

const useReact = mode === 'wc-react' || mode === 'all'
const useVue = mode === 'wc-vue' || mode === 'all'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },

      plugins: [
        wc({
          outDir: 'wc',
          manifestFile: 'zeus.components.json',
          customElementsFile: 'custom-elements.json',
          dts: true,
          jsxDts: true,
        }),

        ...(useReact
          ? [
              react({
                outDir: 'react',
                dts: true,
                namedSlots: 'props',
              }),
            ]
          : []),

        ...(useVue
          ? [
              vue({
                outDir: 'vue',
                dts: true,
                globalDts: true,
              }),
            ]
          : []),
      ],
    }),
  ],

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: 'esbuild',
    sourcemap: false,

    rollupOptions: {
      input: createInput(),
      external: ['react', 'vue'],
    },
  },
})

function createInput(): Record<string, string> {
  const input: Record<string, string> = {
    'wc-single': 'src/entries/wc-single.ts',
    'wc-all': 'src/entries/wc-all.ts',
    'wc-shadow-single': 'src/entries/wc-shadow-single.ts',
    'wc-shadow-all': 'src/entries/wc-shadow-all.ts',
    'wc-nested': 'src/entries/wc-nested.ts',
  }

  if (useReact) {
    input['react-single'] = 'src/entries/react-single.ts'
    input['react-all'] = 'src/entries/react-all.ts'
  }

  if (useVue) {
    input['vue-single'] = 'src/entries/vue-single.ts'
    input['vue-all'] = 'src/entries/vue-all.ts'
  }

  return input
}
