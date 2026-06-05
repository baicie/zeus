import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import createZeusPlugin from '@zeus-js/bundler-plugin'
import wc from '@zeus-js/output-wc'
import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import vue from '../src'

import type { InputPluginOption } from 'rollup'

function asRollupPlugin(plugin: unknown): InputPluginOption {
  return plugin as InputPluginOption
}

describe('output-vue-wrapper', () => {
  it('emits Vue wrapper files in lazy mode', async () => {
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
              vue({
                outDir: 'vue',
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

    expect(files).toContain('vue/z-button.js')
    expect(files).toContain('vue/index.js')
    expect(files).toContain('vue/index.d.ts')
    expect(files).toContain('vue/global.d.ts')

    await bundle.close()
  })

  it('generated Vue wrapper only syncs provided props in event-bridge mode', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-vue-typecheck-'))

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
      external: ['vue'],
      plugins: [
        asRollupPlugin(
          createZeusPlugin({
            root,
            components: {
              include: ['src/components/**/*.{ts,tsx}'],
            },
            plugins: [
              wc({ outDir: 'wc' }),
              vue({ outDir: 'vue', wrapper: 'event-bridge' }),
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
      item => item.fileName === 'vue/z-button.js',
    )
    expect(jsFile).toBeDefined()

    const code =
      jsFile?.type === 'chunk'
        ? ((jsFile as { code?: string }).code ?? '')
        : String((jsFile as { source?: string }).source ?? '')

    expect(code).toContain('getCurrentInstance')
    expect(code).toContain('hasRawProp(name)')
    expect(code).toContain('const rawProps = rawVNode.props || {}')
    expect(code).toContain('Object.assign({}, attrs, { ref: elRef })')
    expect(code).toContain('el[name] = props[name]')
    expect(code).not.toContain('el.variant = props.variant')
    expect(code).not.toContain('el.disabled = props.disabled')
    expect(code).not.toContain('...attrs')

    await bundle.close()
  })

  it('generated Vue wrapper is minimal by default', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-vue-minimal-'))

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
      external: ['vue'],
      plugins: [
        createZeusPlugin({
          root,
          components: {
            include: ['src/components/**/*.{ts,tsx}'],
          },
          plugins: [
            wc({ outDir: 'wc', register: 'lazy' }),
            vue({ outDir: 'vue' }),
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
      item => item.fileName === 'vue/z-button.js',
    )
    expect(jsFile).toBeDefined()

    const code =
      jsFile?.type === 'chunk'
        ? ((jsFile as { code?: string }).code ?? '')
        : String((jsFile as { source?: string }).source ?? '')

    // Minimal mode should NOT have prop sync
    expect(code).not.toContain('el.variant = props.variant')
    expect(code).not.toContain('watch(')
    expect(code).not.toContain('onMounted(')
    expect(code).not.toContain('addEventListener')
    expect(code).toContain('Object.assign({}, attrs)')
    expect(code).not.toContain('...attrs')

    await bundle.close()
  })
})
