import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { generateWCJsxDts } from '../../../web-c/component-dts/src/generateJsxDts'

const root = fileURLToPath(new URL('../../../../', import.meta.url))
const reactRequire = createRequire(
  path.join(root, 'examples/react-wrapper/package.json'),
)
const vueRequire = createRequire(
  path.join(root, 'packages/web-c/output-vue-wrapper/package.json'),
)

describe('Zeus JSX type namespace', () => {
  it.each(['preserve', 'automatic', 'development'])(
    '%s keeps native value semantics separate from framework JSX types',
    async mode => {
      const directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'zeus-jsx-types-'),
      )
      try {
        const generatedTypes = generateWCJsxDts({
          schemaVersion: 1,
          components: [
            {
              tag: 'z-typed-counter',
              name: 'TypedCounter',
              exportName: 'TypedCounter',
              source: 'src/counter.tsx',
              props: { count: { type: 'number', required: true } },
              events: {},
              slots: {},
              hostAttributes: [],
              cssParts: [],
              cssVars: {},
            },
          ],
        })
        await fs.writeFile(
          path.join(directory, 'custom-elements.d.ts'),
          generatedTypes,
        )
        const consumer = path.join(directory, 'consumer.tsx')
        await fs.writeFile(
          consumer,
          `
import type { MouseEvent as ReactMouseEvent } from 'react'
import type {} from 'vue/jsx'
import type { JSX as PublicJSX } from '@zeus-js/zeus/jsx'
import type { JSX as RuntimeJSX } from '@zeus-js/zeus/jsx-runtime'
import type { JSX as DevJSX } from '@zeus-js/zeus/jsx-dev-runtime'
import './custom-elements'
const fragment = <><section><header>Header</header><footer>Footer</footer></section></>
const button = <button disabled={true} data-count={1} aria-disabled={false}
  class={{ active: true }} style={{ color: 'red' }}
  onClick={event => { const native: MouseEvent = event; void native }}
  onPointerDown={event => { const native: PointerEvent = event; void native }}
  ref={element => { const native: HTMLButtonElement | null = element; void native }} />
const image = <picture><source srcset="image.webp" /><img src="image.png" alt="Image" /></picture>
const graphic = <svg viewBox="0 0 100 100"><defs><linearGradient id="gradient"><stop offset="0%" /></linearGradient></defs><path d="M0 0" /></svg>
const formatter = (row: { name: string }) => row.name
const custom = <z-untyped-widget config={{ page: 1 }} prop:formatter={formatter} />
const typedCustom = <z-typed-counter count={1} />
function DOMComponent() { return document.createElement('div') }
const component = <DOMComponent />
const runtimeValue: RuntimeJSX.Element = document.createElement('div')
const publicValue: PublicJSX.Element = runtimeValue
const developmentValue: DevJSX.Element = publicValue
// @ts-expect-error Native property typos must not pass through a catch-all index.
const misspelled = <button disabld={true} />
// @ts-expect-error Unknown standard tag names are not custom elements.
const misspelledTag = <buton />
// @ts-expect-error Getter-valued attributes are no longer an implicit binding syntax.
const getterAttribute = <button disabled={() => true} />
// @ts-expect-error Native class takes a value.
const getterClass = <div class={() => 'active'} />
// @ts-expect-error Native style takes a value.
const getterStyle = <div style={() => ({ color: 'red' })} />
// @ts-expect-error Framework synthetic events do not replace native DOM events.
const syntheticEvent = <button onClick={(event: ReactMouseEvent) => event.persist()} />
// @ts-expect-error SVG attributes have the same value semantics.
const getterSVG = <path d={() => 'M0 0'} />
// @ts-expect-error SVG attribute typos must be rejected.
const misspelledSVG = <path strokWidth={1} />
// @ts-expect-error Manifest augmentation keeps the declared number type.
const invalidCustom = <z-typed-counter count="wrong" />
// @ts-expect-error Manifest augmentation keeps required properties.
const missingCustom = <z-typed-counter />
void [fragment, button, image, graphic, custom, typedCustom, component, developmentValue,
  misspelled, misspelledTag, getterAttribute, getterClass, getterStyle, syntheticEvent,
  getterSVG, misspelledSVG, invalidCustom, missingCustom]
`,
        )
        const paths = {
          '@zeus-js/signal/internal': [
            path.join(root, 'packages/core/signal/src/internal.ts'),
          ],
          '@zeus-js/zeus/jsx': [
            path.join(root, 'packages/core/zeus/src/jsx.d.ts'),
          ],
          '@zeus-js/zeus/jsx-runtime': [
            path.join(root, 'packages/core/zeus/jsx-runtime.d.ts'),
          ],
          '@zeus-js/zeus/jsx-dev-runtime': [
            path.join(root, 'packages/core/zeus/jsx-dev-runtime.d.ts'),
          ],
          '@zeus-js/*': [
            path.join(root, 'packages/core/*/src'),
            path.join(root, 'packages/web-c/*/src'),
            path.join(root, 'packages/devtools/*/src'),
          ],
          react: [
            path.join(
              path.dirname(reactRequire.resolve('@types/react/package.json')),
              'index.d.ts',
            ),
          ],
          'vue/jsx': [vueRequire.resolve('vue/jsx')],
        }
        const program = ts.createProgram(
          [consumer, path.join(root, 'packages/global.d.ts')],
          {
            strict: true,
            noEmit: true,
            skipLibCheck: true,
            types: [],
            target: ts.ScriptTarget.ES2022,
            module: ts.ModuleKind.ESNext,
            moduleResolution: ts.ModuleResolutionKind.Bundler,
            jsx:
              mode === 'preserve'
                ? ts.JsxEmit.Preserve
                : mode === 'automatic'
                  ? ts.JsxEmit.ReactJSX
                  : ts.JsxEmit.ReactJSXDev,
            jsxImportSource: '@zeus-js/zeus',
            esModuleInterop: true,
            paths,
          },
        )
        const diagnostics = ts.getPreEmitDiagnostics(program)
        expect(
          diagnostics.map(diagnostic =>
            ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
          ),
        ).toEqual([])
      } finally {
        await fs.rm(directory, { recursive: true, force: true })
      }
    },
    20000,
  )
})
