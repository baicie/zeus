import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import zeus, { react as reactWrapper, wc } from '@zeus-js/web-c/vite'

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
        reactWrapper({
          outDir: 'react',
          wrapper: 'event-bridge',
        }),
      ],
    }),
    react(),
  ],
})
