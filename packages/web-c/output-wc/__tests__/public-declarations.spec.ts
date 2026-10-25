import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { createOutputRegistry } from '@zeus-js/bundler-plugin'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import wc from '../src'

import type { ZeusBuildContext } from '@zeus-js/bundler-plugin'
import type { ComponentManifest } from '@zeus-js/component-analyzer'

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const manifest: ComponentManifest = {
  schemaVersion: 1,
  components: [
    {
      tag: 'z-notice',
      name: 'ZNotice',
      exportName: 'ZNotice',
      source: 'src/notice.tsx',
      props: {
        value: { type: 'number', required: true },
        id: { type: 'string', required: true },
      },
      events: {
        rowChange: {
          key: 'rowChange',
          name: 'row-change',
          reactName: 'onRowChange',
          detail: { rowId: 'string', nativeEvent: 'Event' },
          detailOptional: ['nativeEvent'],
        },
      },
      methods: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    },
  ],
}

describe('public Web Component declaration entry points', () => {
  it.each(['lazy', 'side-effect'] as const)(
    'exposes typed events and activates JSX through %s package exports',
    async register => {
      const root = await fs.mkdtemp(
        path.join(os.tmpdir(), 'zeus-wc-public-dts-'),
      )
      try {
        const packageRoot = path.join(root, 'node_modules/@fixture/notices')
        await fs.mkdir(packageRoot, { recursive: true })
        await fs.writeFile(
          path.join(packageRoot, 'package.json'),
          JSON.stringify({
            name: '@fixture/notices',
            type: 'module',
            exports: Object.fromEntries(
              ['.', './wc', ...(register === 'lazy' ? ['./wc/auto'] : [])].map(
                entry => [entry, { types: './dist/wc/index.d.ts' }],
              ),
            ),
          }),
        )
        const files = await generateDeclarations(register)
        for (const file of files) {
          const filePath = path.join(packageRoot, 'dist', file.fileName)
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await fs.writeFile(filePath, file.source)
        }
        const zeusScope = path.join(root, 'node_modules/@zeus-js')
        await fs.mkdir(zeusScope, { recursive: true })
        // Use the real framework's public exports and declarations, without TS paths.
        await fs.symlink(
          path.join(repositoryRoot, 'packages/core/zeus'),
          path.join(zeusScope, 'zeus'),
          'dir',
        )
        const rootNames: string[] = []
        for (const entry of [
          '@fixture/notices',
          '@fixture/notices/wc',
          ...(register === 'lazy' ? ['@fixture/notices/wc/auto'] : []),
        ]) {
          const consumerPath = path.join(
            root,
            `consumer-${rootNames.length}.tsx`,
          )
          await fs.writeFile(
            consumerPath,
            `
              import type { ZNoticeElement, ZNoticeEventMap } from '${entry}'
              import type { JSX } from '@zeus-js/zeus/jsx'

              declare const notice: ZNoticeElement
              notice.value = 1
              // @ts-expect-error Declared props retain their value type.
              notice.value = '1'
              notice.addEventListener('row-change', event => {
                const rowId: string = event.detail.rowId
                const source: Event | undefined = event.detail.nativeEvent
                // @ts-expect-error Detail fields retain their declared type.
                const invalid: number = event.detail.rowId
                // @ts-expect-error Unknown detail fields are rejected.
                event.detail.missing
                void [rowId, source, invalid]
              })
              notice.removeEventListener('row-change', event => {
                const rowId: string = event.detail.rowId
                void rowId
              })
              const created: ZNoticeElement = document.createElement('z-notice')
              notice.addEventListener('click', event => {
                const mouseEvent: MouseEvent = event
                void mouseEvent
              })
              const payload: ZNoticeEventMap['row-change']['detail'] = { rowId: '1' }
              // @ts-expect-error The shared required field remains required.
              const invalidPayload: ZNoticeEventMap['row-change']['detail'] = {}
              // @ts-expect-error Exported event names use the declared DOM name.
              const invalidName: keyof ZNoticeEventMap = 'rowChange'

              const props: JSX.IntrinsicElements['z-notice'] = {
                value: 1,
                id: 'notice',
                onRowChange(event) {
                  const rowId: string = event.detail.rowId
                  // @ts-expect-error JSX detail matches the public DOM event.
                  const invalid: number = event.detail.rowId
                  void [rowId, invalid]
                },
              }
              // @ts-expect-error JSX props retain their declared type.
              const invalidProp: JSX.IntrinsicElements['z-notice'] = { value: '1', id: 'notice' }
              // @ts-expect-error Component declarations can require a common attribute.
              const missingRequiredId: JSX.IntrinsicElements['z-notice'] = { value: 1 }
              // @ts-expect-error JSX callback names retain their declared name.
              const invalidCallback: JSX.IntrinsicElements['z-notice'] = { value: 1, id: 'notice', onMissing: () => {} }
              const rendered = <z-notice id="notice" value={1} onRowChange={event => {
                const rowId: string = event.detail.rowId
                void rowId
              }} />
              // @ts-expect-error Actual TSX also rejects the wrong prop value.
              const invalidRendered = <z-notice id="notice" value="1" />
              // @ts-expect-error Actual TSX rejects unknown callback names.
              const invalidRenderedCallback = <z-notice id="notice" value={1} onMissing={() => {}} />
              const unregistered = <x-unregistered arbitrary={{ value: 1 }} />
              const native = <button disabled title="Native">Ready</button>
              // @ts-expect-error Native DOM attributes keep value semantics.
              const invalidNative = <button disabled={() => true} />
              // @ts-expect-error Native attribute values retain their declared type.
              const invalidNativeTitle = <button title={{ value: 1 }} />
              void [payload, invalidPayload, invalidName, props, invalidProp, invalidCallback,
                rendered, invalidRendered, invalidRenderedCallback,
                unregistered, native, invalidNative, invalidNativeTitle, missingRequiredId, created]
            `,
          )
          rootNames.push(consumerPath)
        }
        const program = ts.createProgram(rootNames, {
          lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
          jsxImportSource: '@zeus-js/zeus',
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          noEmit: true,
          strict: true,
          skipLibCheck: false,
          target: ts.ScriptTarget.ESNext,
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
        await fs.rm(root, { recursive: true, force: true })
      }
    },
    15000,
  )

  it.each(['lazy', 'side-effect'] as const)(
    'does not reference disabled JSX declarations in %s mode',
    async register => {
      const files = await generateDeclarations(register, false)
      const index = files.find(file => file.fileName === 'wc/index.d.ts')
      expect(index).toBeDefined()
      expect(index?.source).not.toContain("import './")
      expect(files.some(file => file.fileName.endsWith('jsx.d.ts'))).toBe(false)
    },
  )
})

async function generateDeclarations(
  register: 'lazy' | 'side-effect',
  jsxDts = true,
) {
  const plugin = wc({ register, jsxDts })
  const ctx: ZeusBuildContext = {
    manifest,
    root: '/project',
    diagnostics: [],
    dts: { enabled: true, mode: 'auto' as const, reason: [] },
    outputs: createOutputRegistry(),
    emitFile: () => undefined,
    warn: () => undefined,
    error: message => {
      throw new Error(String(message))
    },
    addWatchFile: () => undefined,
    meta: { watchMode: false },
  }
  const files = (await plugin.generateBundle!(ctx, {})) ?? []
  return files.map(file => {
    if (file.type !== 'asset' || typeof file.source !== 'string') {
      throw new Error('Expected generated declaration assets')
    }
    return { fileName: file.fileName, source: file.source }
  })
}
