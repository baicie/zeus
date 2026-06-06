import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import createZeusPlugin from '@zeus-js/bundler-plugin'
import { rollup } from 'rollup'
import { describe, expect, it } from 'vitest'

import { componentLibrary } from '../src'

import type { InputPluginOption, OutputAsset, OutputChunk } from 'rollup'

function asRollupPlugin(plugin: unknown): InputPluginOption {
  return plugin as InputPluginOption
}

describe('componentLibrary', () => {
  it('adds wc output when react wrappers are requested', () => {
    const plugins = componentLibrary({
      styles: false,
      targets: ['react'],
    })

    expect(plugins.map(plugin => plugin.name)).toEqual([
      'zeus-output-wc',
      'zeus-output-react-wrapper',
    ])
  })

  it('adds wc output when vue wrappers are requested', () => {
    const plugins = componentLibrary({
      styles: false,
      targets: ['vue'],
    })

    expect(plugins.map(plugin => plugin.name)).toEqual([
      'zeus-output-wc',
      'zeus-output-vue-wrapper',
    ])
  })

  it('uses event bridge wrappers by default', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'zeus-preset-'))

    await fs.mkdir(path.join(root, 'src/components'), { recursive: true })
    await fs.writeFile(path.join(root, 'src/index.ts'), 'export {}')
    await fs.writeFile(
      path.join(root, 'src/components/button.tsx'),
      [
        'import { defineElement, event, Host, Slot } from "@zeus-js/zeus"',
        '',
        'export const ZButton = defineElement(',
        '  "z-button",',
        '  {',
        '    emits: {',
        '      valueChange: event<{ value: string }>(),',
        '    },',
        '  },',
        '  (_props, { emit }) => (',
        '    <Host><button onClick={() => emit.valueChange({ value: "next" })}><Slot /></button></Host>',
        '  )',
        ')',
      ].join('\n'),
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['react', 'vue'],
      plugins: [
        asRollupPlugin(
          createZeusPlugin({
            root,
            components: {
              include: ['src/components/**/*.{ts,tsx}'],
            },
            plugins: componentLibrary({
              styles: false,
            }),
          }),
        ),
      ],
      onwarn() {},
    })

    const output = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    const reactWrapper = getChunkCode(output.output, 'react/z-button.js')
    const vueWrapper = getChunkCode(output.output, 'vue/z-button.js')

    expect(reactWrapper).toContain('addEventListener("value-change"')
    expect(reactWrapper).toContain('"onValueChange"')
    expect(vueWrapper).toContain('const EVENT_NAMES = ["value-change"]')
    expect(vueWrapper).toContain('emits: EVENT_NAMES')

    await bundle.close()
  })

  it('keeps minimal wrappers when explicitly requested', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-preset-minimal-'),
    )

    await fs.mkdir(path.join(root, 'src/components'), { recursive: true })
    await fs.writeFile(path.join(root, 'src/index.ts'), 'export {}')
    await fs.writeFile(
      path.join(root, 'src/components/button.tsx'),
      [
        'import { defineElement, event, Host } from "@zeus-js/zeus"',
        '',
        'export const ZButton = defineElement(',
        '  "z-button",',
        '  { emits: { valueChange: event<{ value: string }>() } },',
        '  (_props, { emit }) => <Host onClick={() => emit.valueChange({ value: "next" })} />',
        ')',
      ].join('\n'),
    )

    const bundle = await rollup({
      input: path.join(root, 'src/index.ts'),
      external: ['react', 'vue'],
      plugins: [
        asRollupPlugin(
          createZeusPlugin({
            root,
            components: {
              include: ['src/components/**/*.{ts,tsx}'],
            },
            plugins: componentLibrary({
              styles: false,
              wrapper: 'minimal',
            }),
          }),
        ),
      ],
      onwarn() {},
    })

    const output = await bundle.generate({
      dir: path.join(root, 'dist'),
      format: 'esm',
    })

    const reactWrapper = getChunkCode(output.output, 'react/z-button.js')
    const vueWrapper = getChunkCode(output.output, 'vue/z-button.js')

    expect(reactWrapper).not.toContain('addEventListener("value-change"')
    expect(vueWrapper).not.toContain('const EVENT_NAMES = ["value-change"]')

    await bundle.close()
  })
})

function getChunkCode(
  output: Array<OutputChunk | OutputAsset>,
  fileName: string,
): string {
  const file = output.find(item => item.fileName === fileName)

  if (!file) return ''

  return file.type === 'chunk' ? file.code : String(file.source)
}
