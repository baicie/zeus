import { defineConfig } from 'vite'

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'

export default defineConfig({
  plugins: [
    zeus({
      root: __dirname,
      components: {
        include: ['src/components/**/*.{ts,tsx}'],
      },
      outputs: [
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
