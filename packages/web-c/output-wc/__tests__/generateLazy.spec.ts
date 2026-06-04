/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'

import { generateLazyEntry } from '../src/generateLazyEntry'
import { generateLazyManifest } from '../src/generateLazyManifest'
import {
  generateAutoEntry,
  generateLazyIndex,
  generateLoader,
} from '../src/generateLoader'

describe('generateLazyManifest', () => {
  it('generates manifest with tagName and load function', () => {
    const code = generateLazyManifest({
      components: [
        {
          tag: 'zw-button',
          name: 'ZwButton',
          exportName: 'ZwButton',
          source: 'src/button.tsx',
          props: {
            disabled: {
              type: 'boolean',
              reflect: true,
              default: false,
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        } as any,
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

    expect(code).not.toContain('import type')
    expect(code).toContain('tagName: "zw-button"')
    expect(code).toContain("load: () => import('./zw-button.entry.js')")
    expect(code).toContain('shadow: true')
  })

  it('handles multiple components', () => {
    const code = generateLazyManifest({
      components: [
        {
          tag: 'zw-button',
          name: 'ZwButton',
          exportName: 'ZwButton',
          source: 'src/button.tsx',
          props: {},
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        } as any,
        {
          tag: 'zw-input',
          name: 'ZwInput',
          exportName: 'ZwInput',
          source: 'src/input.tsx',
          props: {},
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        } as any,
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

    expect(code).toContain('tagName: "zw-button"')
    expect(code).toContain("load: () => import('./zw-button.entry.js')")
    expect(code).toContain('tagName: "zw-input"')
    expect(code).toContain("load: () => import('./zw-input.entry.js')")
  })

  it('includes props with attributes and defaults', () => {
    const code = generateLazyManifest({
      components: [
        {
          tag: 'zw-button',
          name: 'ZwButton',
          exportName: 'ZwButton',
          source: 'src/button.tsx',
          props: {
            size: {
              type: 'string',
              reflect: true,
              default: 'md',
            },
            disabled: {
              type: 'boolean',
              reflect: false,
              default: false,
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        } as any,
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

    expect(code).toContain('name: "size"')
    expect(code).toContain('type: "string"')
    expect(code).toContain('reflect: true')
    expect(code).toContain('default: "md"')
  })

  it('preserves property-only props with attrName false', () => {
    const code = generateLazyManifest({
      components: [
        {
          tag: 'zw-table',
          name: 'ZwTable',
          exportName: 'ZwTable',
          source: 'src/table.tsx',
          props: {
            columns: {
              type: 'array',
              attr: false,
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        } as any,
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

    expect(code).toContain('name: "columns", attrName: false')
    expect(code).not.toContain('attrName: "columns"')
  })

  it('includes events', () => {
    const code = generateLazyManifest({
      components: [
        {
          tag: 'zw-button',
          name: 'ZwButton',
          exportName: 'ZwButton',
          source: 'src/button.tsx',
          props: {},
          events: {
            press: {},
          },
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        } as any,
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

    expect(code).toContain('events: [')
    expect(code).toContain('name: "press"')
  })

  it('includes slots', () => {
    const code = generateLazyManifest({
      components: [
        {
          tag: 'zw-card',
          name: 'ZwCard',
          exportName: 'ZwCard',
          source: 'src/card.tsx',
          props: {},
          events: {},
          slots: {
            default: {},
            header: {},
          },
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        } as any,
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

    expect(code).toContain('slots: [')
    expect(code).toContain('name: "default"')
    expect(code).toContain('name: "header"')
  })
})

describe('generateLoader', () => {
  it('generates loader with defineCustomElements', () => {
    const code = generateLoader()

    expect(code).toContain(
      'import { bootstrapLazy } from "@zeus-js/web-c-runtime"',
    )
    expect(code).toContain(
      'import { components } from "./components.manifest.js"',
    )
    expect(code).toContain('export function defineCustomElements(')
    expect(code).toContain(
      'export const defineLazyElements = defineCustomElements',
    )
    expect(code).toContain('bootstrapLazy(components')
    expect(code).toContain('const definedRegistries = new WeakSet()')
    expect(code).toContain('typeof customElements !== "undefined"')
    expect(code).toContain('registry,')
  })

  it('dedupes per registry instead of global state', () => {
    const code = generateLoader()

    expect(code).not.toContain('ZEUS_DEFINE_KEY')
    expect(code).toContain('definedRegistries.has(registry)')
    expect(code).toContain('definedRegistries.add(registry)')
  })
})

describe('generateLazyIndex', () => {
  it('exports defineCustomElements and defineLazyElements from loader', () => {
    const code = generateLazyIndex()

    expect(code).toContain('export {')
    expect(code).toContain('defineCustomElements,')
    expect(code).toContain('defineLazyElements,')
    expect(code).toContain('from "./loader.js"')
  })
})

describe('generateAutoEntry', () => {
  it('generates auto entry', () => {
    const code = generateAutoEntry()

    expect(code).toContain('import { defineCustomElements } from "./loader.js"')
    expect(code).toContain('defineCustomElements()')
    expect(code).toContain('export {}')
  })
})

describe('generateLazyEntry', () => {
  it('generates entry with createComponent function', () => {
    const code = generateLazyEntry({
      component: {
        tag: 'zw-button',
        name: 'ZwButton',
        exportName: 'ZwButton',
        source: 'src/button.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      } as any,
      outPath: 'wc/zw-button.entry.js',
    })

    expect(code).not.toContain('import type')
    expect(code).toContain(
      'import { mountElementDefinition } from "@zeus-js/runtime-dom"',
    )
    expect(code).toContain('class ZwButtonComponent')
    expect(code).toContain('constructor(hostRef)')
    expect(code).toContain('connected()')
    expect(code).toContain('disconnected()')
    expect(code).toContain('propertyChanged(name, oldValue, newValue)')
    expect(code).toContain('attributeChanged(name, oldValue, newValue)')
    expect(code).toContain('render()')
    expect(code).toContain(
      'this.mounted = mountElementDefinition(ZwButton, this.hostRef.host, this.hostRef.values)',
    )
    expect(code).toContain('export function createComponent(hostRef)')
    expect(code).toContain('export default moduleExports')
    expect(code).toContain('createComponent')
  })

  it('does not call component constructor as a render function', () => {
    const code = generateLazyEntry({
      component: {
        tag: 'zw-button',
        name: 'ZwButton',
        exportName: 'ZwButton',
        source: 'src/button.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      } as any,
      outPath: 'wc/zw-button.entry.js',
    })

    expect(code).not.toContain('ZwButton(host)')
    expect(code).toContain('mountElementDefinition(ZwButton')
  })

  it('generates relative import path', () => {
    const code = generateLazyEntry({
      component: {
        tag: 'zw-button',
        name: 'ZwButton',
        exportName: 'ZwButton',
        source: 'src/components/button.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      } as any,
      outPath: 'wc/zw-button.entry.js',
    })

    expect(code).toContain('from "../../src/components/button.tsx"')
  })
})
