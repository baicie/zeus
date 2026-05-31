import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import createZeusPlugin from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'
import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import vue from '../src'

describe('output-vue-wrapper', () => {
  it('emits Vue wrapper files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-output-vue-'))

    await fs.mkdir(path.join(root, 'src/components'), {
      recursive: true,
    })

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export {}')

    await fs.writeFile(
      path.join(root, 'src/components/button.tsx'),
      [
        'import { defineElement, Host, Slot } from "@zeus-js/zeus"',
        '',
        'export const ZButton = defineElement(',
        '  "z-button",',
        '  {},',
        '  () => <Host><button><Slot /></button></Host>',
        ')',
      ].join('\n'),
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['vue'],
      plugins: [
        createZeusPlugin({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          outputs: [
            wc({
              outDir: 'wc',
            }),
            vue({
              outDir: 'vue',
              wcOutDir: '../wc',
            }),
          ],
        }),
      ],
      onwarn() {},
    })

    const output = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    const files = output.output.map(item => item.fileName)

    expect(files).toContain('vue/z-button.js')
    expect(files).toContain('vue/index.js')
    expect(files).toContain('vue/index.d.ts')
    expect(files).toContain('vue/global.d.ts')
  })
})
