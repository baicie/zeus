import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import reactWrapper from '@zeus-js/output-react-wrapper'

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
          dts: true,
          jsxDts: true,
        }),
        reactWrapper({
          outDir: 'react',
          wcOutDir: './wc',
        }),
      ],
    }),
    react(),
  ],
})
