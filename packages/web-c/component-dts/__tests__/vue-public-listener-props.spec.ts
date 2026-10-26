import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

import ts from 'typescript'
import { expect, it } from 'vitest'

import { generateVueDts } from '../src/generateVueDts'

import type { ComponentManifest } from '@zeus-js/component-analyzer'

it('preserves listener props and emit payloads through a public Vue package export', () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'zeus-vue-listener-props-'),
  )
  try {
    const vueRequire = createRequire(
      path.resolve('packages/web-c/output-vue-wrapper/package.json'),
    )
    const modules = path.join(root, 'node_modules')
    fs.mkdirSync(modules, { recursive: true })
    fs.symlinkSync(
      path.dirname(vueRequire.resolve('vue/package.json')),
      path.join(modules, 'vue'),
      'dir',
    )
    const packageRoot = path.join(modules, '@zeus-fixture/dialog')
    fs.mkdirSync(packageRoot, { recursive: true })
    fs.writeFileSync(
      path.join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@zeus-fixture/dialog',
        type: 'module',
        exports: { './vue': { types: './index.d.ts' } },
      }),
    )
    const manifest: ComponentManifest = {
      schemaVersion: 1,
      components: [
        {
          tag: 'z-dialog',
          name: 'Dialog',
          exportName: 'Dialog',
          source: 'src/dialog.tsx',
          props: {
            open: { type: 'boolean' },
            config: {
              type: 'object',
              declaration: {
                reference: 'EmitsToProps',
                type: '{ label: string }',
              },
            },
          },
          events: {
            openChange: {
              name: 'open-change',
              reactName: 'onOpenChange',
              detail: { open: 'boolean', nativeEvent: 'Event' },
              detailOptional: ['nativeEvent'],
            },
          },
          models: [
            { prop: 'open', event: 'open-change', eventPath: 'detail.open' },
          ],
          slots: { default: { name: 'default' } },
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    }
    fs.writeFileSync(
      path.join(packageRoot, 'index.d.ts'),
      generateVueDts(manifest),
    )
    const filename = path.join(root, 'consumer.ts')
    fs.writeFileSync(
      filename,
      `
      import { Dialog } from '@zeus-fixture/dialog/vue'
      type Props = InstanceType<typeof Dialog>['$props']
      const valid: Props = {
        open: true,
        config: { label: 'dialog' },
        'onOpen-change': event => {
          const open: boolean = event.detail.open
          const nativeEvent: Event | undefined = event.detail.nativeEvent
          // @ts-expect-error nativeEvent is optional in the public listener.
          const requiredEvent: Event = event.detail.nativeEvent
          // @ts-expect-error required fields retain their exact type.
          const invalidOpen: string = event.detail.open
          void [open, nativeEvent, requiredEvent, invalidOpen]
        },
        'onUpdate:open': value => { const open: boolean = value; void open },
      }
      // @ts-expect-error component props remain typed.
      const invalidProp: Props = { open: 'yes' }
      // @ts-expect-error imported Vue helper names cannot erase user declaration types.
      const invalidConfig: Props = { config: { label: 42 } }
      // @ts-expect-error listener names preserve the declared DOM event name.
      const invalidListener: Props = { 'onOpen-chagne': () => {} }
      // @ts-expect-error listener payloads remain typed.
      const invalidDetail: Props = { 'onOpen-change': (event: CustomEvent<{ open: string }>) => {} }
      declare const dialog: InstanceType<typeof Dialog>
      dialog.$emit('open-change', new CustomEvent('open-change', { detail: { open: true } }))
      dialog.$emit('open-change', new CustomEvent('open-change', { detail: { open: false, nativeEvent: new Event('close') } }))
      dialog.$emit('update:open', true)
      // @ts-expect-error required open remains boolean for public emits.
      dialog.$emit('open-change', new CustomEvent('open-change', { detail: { open: 'yes' } }))
      // @ts-expect-error public emits still require the open field.
      dialog.$emit('open-change', new CustomEvent('open-change', { detail: {} }))
      // @ts-expect-error event names preserve the declared DOM event name.
      dialog.$emit('open-chagne', new CustomEvent('open-chagne', { detail: { open: true } }))
      // @ts-expect-error model update payloads retain their prop type.
      dialog.$emit('update:open', 'yes')
      void [valid, invalidProp, invalidConfig, invalidListener, invalidDetail]
    `,
    )
    const program = ts.createProgram([filename], {
      lib: ['lib.es2022.d.ts', 'lib.dom.d.ts'],
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      strict: true,
      skipLibCheck: false,
      types: [],
    })
    expect(
      ts
        .getPreEmitDiagnostics(program)
        .map(diagnostic =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
        ),
    ).toEqual([])
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
}, 30_000)
