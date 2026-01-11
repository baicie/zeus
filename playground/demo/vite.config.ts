import { defineConfig } from 'vite'
import { vitePlugin } from '@zeus-js/build-tools/vite'

export default defineConfig({
  plugins: [
    vitePlugin({
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [/node_modules/],
    }),
  ],
})
