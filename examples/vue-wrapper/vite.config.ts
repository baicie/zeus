import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import vueWrapper from '@zeus-js/output-vue-wrapper'

export default defineConfig({
  plugins: [
    zeus({
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      plugins: [
        wc({
          outDir: 'wc',
          dts: true,
          jsxDts: true,
        }),
        vueWrapper({
          outDir: 'vue',
        }),
      ],
    }),
    vue(),
  ],
})
