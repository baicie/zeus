import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import createZeusPlugin from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'
import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import react from '../src'

describe('output-react-wrapper', () => {
  it('emits React wrapper files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-output-react-'))

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
        '  {',
        '    props: {',
        '      variant: {',
        '        type: String,',
        '        default: "default",',
        '        reflect: true,',
        '      },',
        '    },',
        '  },',
        '  () => <Host><button onClick={() => {}}><Slot /></button></Host>',
        ')',
      ].join('\n'),
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['react'],
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
            react({
              outDir: 'react',
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

    expect(files).toContain('react/z-button.js')
    expect(files).toContain('react/index.js')
    expect(files).toContain('react/index.d.ts')
  })

  it('generated React wrapper uses destructured props for prop sync', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-react-typecheck-'),
    )

    await fs.mkdir(path.join(root, 'src/components'), { recursive: true })

    await fs.writeFile(path.join(root, 'src/index.ts'), 'export {}')

    await fs.writeFile(
      path.join(root, 'src/components/button.tsx'),
      [
        'import { defineElement, Host, Slot } from "@zeus-js/zeus"',
        '',
        'export const ZButton = defineElement(',
        '  "z-button",',
        '  {',
        '    props: {',
        '      variant: { type: String, default: "default", reflect: true },',
        '      disabled: { type: Boolean },',
        '    },',
        '  },',
        '  () => <Host><button><Slot /></button></Host>',
        ')',
      ].join('\n'),
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['react'],
      plugins: [
        createZeusPlugin({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          outputs: [
            wc({ outDir: 'wc' }),
            react({ outDir: 'react', wcOutDir: '../wc' }),
          ],
        }),
      ],
      onwarn() {},
    })

    const output = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    const jsFile = output.output.find(
      item => item.fileName === 'react/z-button.js',
    )
    expect(jsFile).toBeDefined()

    const code =
      (jsFile as { type: string; fileName: string; code?: string }).code ?? ''

    // React destructures props — bare variant/disabled are correct
    expect(code).toContain('variant !== undefined')
    expect(code).toContain('el.variant = variant')
    expect(code).toContain('disabled !== undefined')
    expect(code).toContain('el.disabled = disabled')

    // React wrapper must destructure props
    expect(code).toContain('const {')
    expect(code).toContain('className,')
    expect(code).toContain('style,')
    expect(code).toContain('...rest')

    await bundle.close()
  })
})
