import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import createZeusPlugin from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'
import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import react from '../src'

import type { InputPluginOption } from 'rollup'

function asRollupPlugin(plugin: unknown): InputPluginOption {
  return plugin as InputPluginOption
}

describe('output-react-wrapper', () => {
  it('emits React wrapper files in lazy mode', async () => {
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
        asRollupPlugin(
          createZeusPlugin({
            root,
            components: {
              include: ['src/components/**/*.{ts,tsx}'],
            },
            plugins: [
              wc({
                outDir: 'wc',
                register: 'lazy',
              }),
              react({
                outDir: 'react',
              }),
            ],
          }),
        ),
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

    await bundle.close()
  })

  it('generated React wrapper uses explicit props for prop sync in event-bridge mode', async () => {
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
        asRollupPlugin(
          createZeusPlugin({
            root,
            components: {
              include: ['src/components/**/*.{ts,tsx}'],
            },
            plugins: [
              wc({ outDir: 'wc' }),
              react({ outDir: 'react', wrapper: 'event-bridge' }),
            ],
          }),
        ),
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
      jsFile?.type === 'chunk'
        ? ((jsFile as { code?: string }).code ?? '')
        : String((jsFile as { source?: string }).source ?? '')

    expect(code).toContain('el["disabled"] = propValue0')
    expect(code).toContain('el["variant"] = propValue1')

    expect(code).toContain('const className = props.className')
    expect(code).toContain('const style = props.style')
    expect(code).toContain('const rest = omitProps(props')
    expect(code).toContain('rest.ref = innerRef')
    expect(code).toContain('rest.className = className')
    expect(code).toContain('rest.style = style')
    expect(code).not.toContain('...rest')

    await bundle.close()
  })

  it('generated React wrapper uses runtime mode by default (calls createComponent)', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-react-runtime-'))

    await fs.mkdir(path.join(root, 'src/components'), { recursive: true })

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
      external: ['react'],
      plugins: [
        createZeusPlugin({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          plugins: [
            wc({ outDir: 'wc', register: 'lazy' }),
            react({ outDir: 'react' }),
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
      jsFile?.type === 'chunk'
        ? ((jsFile as { code?: string }).code ?? '')
        : String((jsFile as { source?: string }).source ?? '')

    expect(code).toContain(
      "import { createComponent } from '@zeus-js/output-react-wrapper/runtime'",
    )
    expect(code).toContain('createComponent({')
    expect(code).toContain('tagName: "z-button"')

    await bundle.close()
  })

  it('still supports explicit minimal wrapper', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-react-minimal-'))

    await fs.mkdir(path.join(root, 'src/components'), { recursive: true })

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
      external: ['react'],
      plugins: [
        createZeusPlugin({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          plugins: [
            wc({ outDir: 'wc', register: 'lazy' }),
            react({ outDir: 'react', wrapper: 'minimal' }),
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
      jsFile?.type === 'chunk'
        ? ((jsFile as { code?: string }).code ?? '')
        : String((jsFile as { source?: string }).source ?? '')

    expect(code).toContain('React.forwardRef')
    expect(code).not.toContain('@zeus-js/output-react-wrapper/runtime')

    await bundle.close()
  })
})
