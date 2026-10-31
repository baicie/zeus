// One component source must produce the same attribute ABI in every output.
// The runtime element's observedAttributes is the reference: it is what the
// browser actually reports to attributeChangedCallback.
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { defineElement, prop } from '../../../core/runtime-dom/src'
import { analyzeFile } from '../../component-analyzer/src'
import { generateReactWrapper } from '../../output-react-wrapper/src/generateReactWrapper'
import { generateVueWrapper } from '../../output-vue-wrapper/src/generateVueWrapper'
import { bootstrapLazy } from '../../web-c-runtime/src'
import { generateCustomElementsJson } from '../src/generateCustomElementsJson'
import { generateLazyManifest } from '../src/generateLazyManifest'
import { validateComponentManifest } from '../src/generateManifest'
import { generateVSCodeCustomData } from '../src/generateVSCodeCustomData'

import type { ComponentRecord } from '../../component-analyzer/src'

// Covers camelCase names, digits, an explicit mixed-case alias, opt-out,
// structured props with and without a deserializer, and functions.
const propsSource = `{
  userName: String,
  maxCount: Number,
  open: Boolean,
  level2Title: String,
  dataUrl: prop(String, { attr: 'dataURL' }),
  internalState: prop(String, { attr: false }),
  items: prop(Array, { deserialize: value => (value ? value.split('|') : []) }),
  config: Object,
  formatter: Function,
}`

const source = `
import { defineElement, Host, prop } from '@zeus-js/zeus'

export const ZAbi = defineElement(
  'z-abi',
  { shadow: true, props: ${propsSource} },
  () => <Host />,
)
`

let dom: JSDOM

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  for (const name of [
    'window',
    'document',
    'HTMLElement',
    'Node',
    'Element',
    'customElements',
    'MutationObserver',
    'CustomEvent',
    'Event',
  ] as const) {
    vi.stubGlobal(
      name,
      name === 'window' ? dom.window : (dom.window as never)[name],
    )
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  dom.window.close()
})

function analyzedComponent(): ComponentRecord {
  const result = analyzeFile({ file: 'src/abi.tsx', code: source })
  expect(result.diagnostics).toEqual([])
  return result.components[0]
}

function runtimeObservedAttributes(): string[] {
  const props = new Function('prop', `return ${propsSource}`)(prop)
  const Element = defineElement('z-abi-runtime', { shadow: true, props }, () =>
    document.createElement('span'),
  ) as unknown as { observedAttributes: string[] }
  return [...Element.observedAttributes].sort()
}

function lazyObservedAttributes(component: ComponentRecord): string[] {
  const code = generateLazyManifest({
    components: [component],
    getEntryFileName: tag => `${tag}.js`,
  })
  const components = new Function(
    `${code.replace('export const components', 'const components').replace(/import\(/g, '(() => null)(')}; return components`,
  )() as Parameters<typeof bootstrapLazy>[0]
  const defined = new Map<string, { observedAttributes: string[] }>()
  bootstrapLazy(components, {
    registry: {
      get: (tag: string) => defined.get(tag),
      define: (tag: string, element: { observedAttributes: string[] }) =>
        defined.set(tag, element),
    } as unknown as CustomElementRegistry,
  })
  return [...defined.get('z-abi')!.observedAttributes].sort()
}

describe('Web Component attribute ABI consistency', () => {
  it('derives the same attribute names in the runtime, lazy loader and documentation outputs', () => {
    const component = analyzedComponent()
    const manifest = { schemaVersion: 1 as const, components: [component] }
    validateComponentManifest(manifest)

    const expected = runtimeObservedAttributes()
    expect(expected).toEqual([
      'dataurl',
      'items',
      'level2-title',
      'max-count',
      'open',
      'user-name',
    ])

    expect(lazyObservedAttributes(component)).toEqual(expected)

    const cem = generateCustomElementsJson({
      manifest,
      getModulePath: tag => `./${tag}.js`,
    })
    const declaration = JSON.parse(cem).modules[0].declarations[0] as {
      attributes?: Array<{ name: string; fieldName?: string }>
    }
    expect(
      (declaration.attributes ?? []).map(attribute => attribute.name).sort(),
    ).toEqual(expected)

    const vscode = JSON.parse(generateVSCodeCustomData(cem)) as {
      tags: Array<{ attributes: Array<{ name: string }> }>
    }
    expect(
      vscode.tags[0].attributes.map(attribute => attribute.name).sort(),
    ).toEqual(expected)
  })

  it('maps every primitive prop to the runtime attribute name in framework wrappers', () => {
    const component = analyzedComponent()
    const expected = new Set(runtimeObservedAttributes())
    const primitiveAttributes: Record<string, string | false> = {
      userName: 'user-name',
      maxCount: 'max-count',
      open: 'open',
      level2Title: 'level2-title',
      dataUrl: 'dataurl',
      internalState: false,
      items: false,
      config: false,
      formatter: false,
    }
    for (const name of Object.values(primitiveAttributes)) {
      if (name) expect(expected.has(name), name).toBe(true)
    }

    const embeddedConfig = (code: string, pattern: RegExp) =>
      JSON.parse(pattern.exec(code)?.[1] ?? 'null') as Record<
        string,
        string | false
      >

    for (const mode of ['runtime', 'minimal', 'event-bridge'] as const) {
      const react = generateReactWrapper({
        component,
        namedSlots: 'props',
        wcModuleId: 'zeus:wc:z-abi',
        mode,
      })
      const vue = generateVueWrapper({
        component,
        wcModuleId: 'zeus:wc:z-abi',
        mode,
      })

      if (mode === 'runtime') {
        expect(embeddedConfig(react, /props: (\{[^\n]*\}),/)).toEqual(
          primitiveAttributes,
        )
      } else if (mode === 'event-bridge') {
        // The event bridge inlines one SSR attribute write per primitive prop.
        for (const [name, attribute] of Object.entries(primitiveAttributes)) {
          if (attribute)
            expect(react, name).toContain(`rest[${JSON.stringify(attribute)}]`)
        }
        expect(react).not.toContain('rest["dataURL"]')
      }
      expect(
        embeddedConfig(
          vue,
          mode === 'runtime'
            ? /props: (\{[^\n]*\}),/
            : /const SSR_PROPERTY_CONFIG = (\{[\s\S]*?\});\n/,
        ),
      ).toEqual(primitiveAttributes)
    }
  })
})
