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
    expect(code).toContain('load: () => import(')
    expect(code).toContain('zw-button.entry.js')
    expect(code).toContain('shadow: false')
  })

  it('generates import with JSON.stringify', () => {
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
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

    expect(code).toContain('load: () => import(')
    expect(code).toContain('zw-button.entry.js')
    expect(code).toContain('import("./zw-button.entry.js")')
  })

  it('normalizes Windows backslashes in file names', () => {
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
      ],
      getEntryFileName: _tag => {
        // Simulate a path with backslashes like a Windows absolute path
        const parts = ['components', 'button.entry.js']
        return parts.join('\\')
      },
    })

    // Backslashes should be normalized to forward slashes
    expect(code).toContain('load: () => import(')
    expect(code).toContain('components/button.entry.js')
  })

  it('avoids double .js extension', () => {
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
      ],
      getEntryFileName: _tag => 'zw-button.entry.js',
    })

    // Must NOT produce .js.js
    expect(code).not.toContain('.js.js')
    expect(code).toContain('load: () => import(')
    expect(code).toContain('zw-button.entry.js')
  })

  it('uses explicit shadow value from meta', () => {
    const code = generateLazyManifest({
      components: [
        {
          tag: 'zw-card',
          name: 'ZwCard',
          exportName: 'ZwCard',
          source: 'src/card.tsx',
          props: {},
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
          meta: { shadow: true },
        } as any,
      ],
      getEntryFileName: tag => `${tag}.entry.js`,
    })

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
    expect(code).toContain('load: () => import(')
    expect(code).toContain('zw-button.entry.js')
    expect(code).toContain('tagName: "zw-input"')
    expect(code).toContain('zw-input.entry.js')
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
    // events are no longer emitted in the lazy manifest
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

    expect(code).not.toContain('events')
    expect(code).not.toContain('slots')
  })

  it('includes slots', () => {
    // slots are no longer emitted in the lazy manifest
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

    expect(code).not.toContain('slots')
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
    expect(code).toContain('typeof customElements === "undefined"')
    expect(code).not.toContain('definedRegistries')
    expect(code).not.toContain('registry')
  })

  it('dedupes calls via module-level flag', () => {
    const code = generateLoader()

    expect(code).toContain('let defined = false')
    expect(code).toContain('if (defined)')
    expect(code).toContain('defined = true')
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
    expect(code).toContain('export function createComponent(hostRef)')
    expect(code).toContain('mounted = undefined')
    expect(code).toContain('mountState = {}')
    expect(code).toContain('ZwButton,')
    expect(code).toContain('hostRef.host,')
    expect(code).toContain('hostRef.values,')
    expect(code).toContain('mountState,')
    expect(code).toContain('export default { createComponent }')
    expect(code).not.toContain('class ')
    expect(code).not.toContain('constructor(')
    expect(code).not.toContain('attributeChanged')
    expect(code).not.toContain('render()')
    expect(code).not.toContain('moduleExports')
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
    expect(code).toContain('mountElementDefinition')
    expect(code).toMatch(/\bmountElementDefinition\(\s*\n\s+ZwButton\b/)
    expect(code).not.toContain('class ')
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
