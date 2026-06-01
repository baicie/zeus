import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import zeus from '@zeus-js/bundler-plugin/vite'
import wc from '@zeus-js/output-wc'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    {
      name: 'zeus-headless-styles',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'styles.css',
          source: readFileSync(resolve(__dirname, 'src/styles.css'), 'utf-8'),
        })
      },
    },
    zeus({
      root: __dirname,
      components: {
        include: [
          'src/button/button.tsx',
          'src/switch/switch.tsx',
          'src/checkbox/checkbox.tsx',
          'src/icon/icon.tsx',
          'src/tabs/tabs.tsx',
          'src/tabs/tab-list.tsx',
          'src/tabs/tab-trigger.tsx',
          'src/tabs/tab-panel.tsx',
          'src/dialog/dialog.tsx',
          'src/dialog/dialog-trigger.tsx',
          'src/dialog/dialog-content.tsx',
          'src/dialog/dialog-title.tsx',
          'src/dialog/dialog-description.tsx',
        ],
        exclude: ['src/shared/**'],
      },
      outputs: [
        wc({
          outDir: 'dist/wc',
          manifestFile: 'zeus.components.json',
          customElementsFile: 'custom-elements.json',
          dts: true,
          jsxDts: true,
        }),
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: 'src/index.ts',
      },
      external: ['react', 'vue'],
    },
  },
  resolve: {
    dedupe: [
      '@zeus-js/signal',
      '@zeus-js/runtime-dom',
      '@zeus-js/zeus',
      '@zeus-js/component-dts',
    ],
  },
})
