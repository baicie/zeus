// One component source must produce the same ABI in every output. The runtime
// element is the reference: the attributes it observes, the events its `emit`
// dispatches, the methods `expose` installs and the slots it renders.
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  defineElement,
  event,
  Host,
  prop,
  Slot,
} from '../../../core/runtime-dom/src'
import { analyzeFile } from '../../component-analyzer/src'
import { generateEventMap } from '../../component-dts/src/generateEventMap'
import { generateVueDts } from '../../component-dts/src/generateVueDts'
import { generateComponentWCDts } from '../../component-dts/src/generateWcDts'
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

const emitsSource = `{
  valueChange: event<{ value: string }>(),
  press: event<{ count: number }>('press-start'),
  quiet: event({ bubbles: false, composed: false, cancelable: true }),
}`

const eventSource = `
import { defineElement, event, Host, Slot } from '@zeus-js/zeus'

export const ZAbiEvents = defineElement(
  'z-abi-events',
  { shadow: true, props: { value: String }, emits: ${emitsSource} },
  (_props, { emit, expose }) => {
    expose({
      focusInput(): void {},
      async check(strict?: boolean): Promise<boolean> {
        return !strict
      },
    })
    emit.valueChange({ value: '' })
    return (
      <Host>
        <Slot name="prefix" />
        <Slot />
      </Host>
    )
  },
)
`

describe('Web Component event, method and slot ABI consistency', () => {
  function analyzedEventComponent(): ComponentRecord {
    const result = analyzeFile({
      file: 'src/abi-events.tsx',
      code: eventSource,
    })
    expect(result.diagnostics).toEqual([])
    return result.components[0]
  }

  async function runtimeReference() {
    const emits = new Function(
      'event',
      `return ${emitsSource.replace(/event<[^>]+>/g, 'event')}`,
    )(event)
    let emitApi: Record<string, (detail?: unknown) => boolean> = {}
    defineElement(
      'z-abi-events-runtime',
      { shadow: true, props: { value: String }, emits },
      (_props, { emit, expose }) => {
        emitApi = emit as typeof emitApi
        expose({
          focusInput() {},
          async check() {
            return true
          },
        })
        return Host({
          children: [Slot({ name: 'prefix' }), Slot({})],
        }) as unknown as Node
      },
    )
    const element = document.createElement('z-abi-events-runtime')
    document.body.append(element)
    await new Promise(resolve => setTimeout(resolve))

    const dispatched: Array<{
      name: string
      bubbles: boolean
      composed: boolean
      cancelable: boolean
    }> = []
    element.dispatchEvent = (dispatchedEvent: Event) => {
      dispatched.push({
        name: dispatchedEvent.type,
        bubbles: dispatchedEvent.bubbles,
        composed: dispatchedEvent.composed,
        cancelable: dispatchedEvent.cancelable,
      })
      return true
    }
    for (const key of Object.keys(emitApi)) emitApi[key]()

    const methods = ['focusInput', 'check'].filter(
      name =>
        typeof (element as unknown as Record<string, unknown>)[name] ===
        'function',
    )
    const slots = [...element.shadowRoot!.querySelectorAll('slot')]
      .map(slot => slot.getAttribute('name') ?? '')
      .sort()
    element.remove()
    return { events: dispatched, methods, slots }
  }

  it('dispatches, documents and declares the same events', async () => {
    const component = analyzedEventComponent()
    const manifest = { schemaVersion: 1 as const, components: [component] }
    validateComponentManifest(manifest)
    const reference = await runtimeReference()

    expect(reference.events).toEqual([
      {
        name: 'value-change',
        bubbles: true,
        composed: true,
        cancelable: false,
      },
      { name: 'press-start', bubbles: true, composed: true, cancelable: false },
      { name: 'quiet', bubbles: false, composed: false, cancelable: true },
    ])
    const names = reference.events.map(entry => entry.name)

    expect(
      Object.entries(component.events).map(([, entry]) => ({
        name: entry.name,
        bubbles: entry.bubbles,
        composed: entry.composed,
        cancelable: entry.cancelable,
      })),
    ).toEqual(reference.events)

    const cem = JSON.parse(
      generateCustomElementsJson({
        manifest,
        getModulePath: tag => `./${tag}.js`,
      }),
    ).modules[0].declarations[0] as { events: Array<{ name: string }> }
    expect(cem.events.map(entry => entry.name)).toEqual(names)

    const declaresEvent = (code: string, name: string) =>
      new RegExp(`\\s["']?${name}["']?: \\(?(?:event: )?CustomEvent`).test(code)
    const eventMap = generateEventMap(component)
    const vueDts = generateVueDts(manifest)
    for (const name of names) {
      expect(declaresEvent(eventMap, name), `event map ${name}`).toBe(true)
      expect(declaresEvent(vueDts, name), `Vue declarations ${name}`).toBe(true)
    }

    const react = generateReactWrapper({
      component,
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-abi-events',
      mode: 'runtime',
    })
    expect(
      JSON.parse(
        / {2}events: (\{[\s\S]*?\n {2}\}),/.exec(react)?.[1] ?? 'null',
      ),
    ).toEqual({
      onValueChange: 'value-change',
      onPress: 'press-start',
      onQuiet: 'quiet',
    })

    const vue = generateVueWrapper({
      component,
      wcModuleId: 'zeus:wc:z-abi-events',
      mode: 'runtime',
    })
    expect(
      JSON.parse(/ {2}events: (\[[^\n]*\]),/.exec(vue)?.[1] ?? 'null'),
    ).toEqual(names)
  })

  it('exposes and declares the same methods and slots', async () => {
    const component = analyzedEventComponent()
    const manifest = { schemaVersion: 1 as const, components: [component] }
    const reference = await runtimeReference()

    expect(reference.methods).toEqual(['focusInput', 'check'])
    expect(Object.keys(component.methods ?? {})).toEqual(reference.methods)

    const lazy = generateLazyManifest({
      components: [component],
      getEntryFileName: tag => `${tag}.js`,
    })
    expect(lazy).toContain(`methods: ${JSON.stringify(reference.methods)}`)

    const declaration = JSON.parse(
      generateCustomElementsJson({
        manifest,
        getModulePath: tag => `./${tag}.js`,
      }),
    ).modules[0].declarations[0] as {
      members: Array<{ kind: string; name: string }>
      slots: Array<{ name: string }>
    }
    expect(
      declaration.members
        .filter(member => member.kind === 'method')
        .map(member => member.name),
    ).toEqual(reference.methods)
    const wcDts = generateComponentWCDts(component)
    for (const method of reference.methods)
      expect(wcDts).toContain(`${method}(`)

    expect(reference.slots).toEqual(['', 'prefix'])
    expect(declaration.slots.map(slot => slot.name).sort()).toEqual(
      reference.slots,
    )

    const react = generateReactWrapper({
      component,
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-abi-events',
      mode: 'runtime',
    })
    const vue = generateVueWrapper({
      component,
      wcModuleId: 'zeus:wc:z-abi-events',
      mode: 'runtime',
    })
    const namedSlots = reference.slots.filter(Boolean)
    expect(
      JSON.parse(/ {2}slots: (\[[^\n]*\]),/.exec(react)?.[1] ?? 'null'),
    ).toEqual(namedSlots)
    expect(
      JSON.parse(/ {2}slots: (\[[^\n]*\]),/.exec(vue)?.[1] ?? 'null'),
    ).toEqual(namedSlots)
  })
})
