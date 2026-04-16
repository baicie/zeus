import { defineConfig } from 'vite'
import { zeusPlugin } from '@zeusjs/vite-plugin'

export default defineConfig({
  plugins: [
    zeusPlugin({
      dev: true,
    }),
  ],
})
