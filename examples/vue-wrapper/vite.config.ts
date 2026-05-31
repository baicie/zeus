import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import vueWrapper from '@zeus-js/output-vue-wrapper'

export default defineConfig({
  plugins: [
    vue(),
    zeus({
      root: __dirname,
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [
        wc({
          outDir: 'dist/wc',
          dts: true,
          jsxDts: true,
        }),
        vueWrapper({
          outDir: 'dist/vue',
          wcOutDir: './dist/wc',
        }),
      ],
    }),
  ],
})
