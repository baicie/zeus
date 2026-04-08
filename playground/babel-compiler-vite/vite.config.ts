import { defineConfig } from 'vite'
import { zeusVitePlugin } from '@zeus-js/vite-plugin-zeus'

export default defineConfig({
  plugins: [
    zeusVitePlugin({
      options: {
        moduleName: '@zeus-js/core',
        ssrModuleName: '@zeus-js/core',
      },
    }),
  ],
  build: {
    minify: false,
  },
})
