import { defineConfig } from 'vite'

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'

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
      ],
    }),
  ],
})
