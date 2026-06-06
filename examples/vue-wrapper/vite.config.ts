import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

import zeus, { vue as vueWrapper, wc } from '@zeus-js/web-c/vite'

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
          wrapper: 'event-bridge',
        }),
      ],
    }),
    vue(),
  ],
})
