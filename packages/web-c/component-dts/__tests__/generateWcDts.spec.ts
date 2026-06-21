import { describe, expect, it } from 'vitest'

import {
  generateComponentWCDts,
  generateWCIndexDts,
} from '../src/generateWcDts'

describe('generateWcDts', () => {
  it('emits typed exposed method signatures', () => {
    const code = generateComponentWCDts({
      tag: 'z-input',
      name: 'ZInput',
      exportName: 'ZInput',
      source: 'src/input.tsx',
      props: {},
      events: {},
      methods: {
        setValue: {
          name: 'setValue',
          parameters: [
            { name: 'value', type: 'string', optional: false },
            { name: 'commit', type: 'boolean', optional: true },
          ],
          returns: 'boolean',
          async: true,
        },
        request: {
          name: 'request',
          parameters: [
            {
              name: 'reasons',
              type: 'string[]',
              rest: true,
            },
          ],
          returns: 'Promise<number>',
          async: false,
        },
      },
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain(
      'setValue(value: string, commit?: boolean): Promise<boolean>',
    )
    expect(code).toContain('request(...reasons: string[]): Promise<number>')
  })

  it('generates typed custom element declaration', () => {
    const code = generateComponentWCDts({
      tag: 'z-button',
      name: 'ZButton',
      exportName: 'ZButton',
      source: 'src/button.tsx',
      props: {
        variant: {
          type: 'string',
          values: ['default', 'outline'],
          default: 'default',
        },
        disabled: {
          type: 'boolean',
        },
      },
      events: {
        press: {
          detail: {
            nativeEvent: 'MouseEvent',
          },
        },
      },
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('export interface ZButtonEventMap')
    expect(code).toContain('press: CustomEvent<{ nativeEvent: MouseEvent }>')
    expect(code).toContain(
      'export interface ZButtonElement extends HTMLElement',
    )
    expect(code).toContain('variant?: "default" | "outline"')
    expect(code).toContain('disabled?: boolean')
    expect(code).toContain('addEventListener<K extends keyof ZButtonEventMap>')
    expect(code).toContain('export declare const ZButton')
  })

  it('generates HTMLElementTagNameMap declaration', () => {
    const code = generateWCIndexDts(
      {
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      {
        getComponentImportPath: () => './z-button',
      },
    )

    expect(code).toContain('export * from "./z-button"')
    expect(code).toContain('interface HTMLElementTagNameMap')
    expect(code).toContain('"z-button": ZButtonElement')
  })

  it('generates index with multiple components', () => {
    const code = generateWCIndexDts(
      {
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
          {
            tag: 'z-card',
            name: 'ZCard',
            exportName: 'ZCard',
            source: 'src/card.tsx',
            props: {},
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      {
        getComponentImportPath: component => `./${component.tag}`,
      },
    )

    expect(code).toContain('export * from "./z-button"')
    expect(code).toContain('export * from "./z-card"')
    expect(code).toContain('"z-button": ZButtonElement')
    expect(code).toContain('"z-card": ZCardElement')
  })

  it('marks required props without ?', () => {
    const code = generateComponentWCDts({
      tag: 'z-input',
      name: 'ZInput',
      exportName: 'ZInput',
      source: 'src/input.tsx',
      props: {
        value: {
          type: 'string',
          required: true,
        },
        label: {
          type: 'string',
          required: false,
        },
        count: {
          type: 'number',
        },
      },
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('value: string')
    expect(code).not.toContain('value?: string')
    expect(code).toContain('label?: string')
    expect(code).toContain('count?: number')
  })

  it('handles props with default value as optional', () => {
    const code = generateComponentWCDts({
      tag: 'z-demo',
      name: 'ZDemo',
      exportName: 'ZDemo',
      source: 'src/demo.tsx',
      props: {
        label: {
          type: 'string',
          default: 'hello',
        },
      },
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('label?: string')
    expect(code).not.toContain('label: string')
  })

  it('handles event with no detail', () => {
    const code = generateComponentWCDts({
      tag: 'z-toggle',
      name: 'ZToggle',
      exportName: 'ZToggle',
      source: 'src/toggle.tsx',
      props: {},
      events: {
        change: {},
      },
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('change: CustomEvent<unknown>')
  })

  it('handles all prop type variants', () => {
    const code = generateComponentWCDts({
      tag: 'z-demo',
      name: 'ZDemo',
      exportName: 'ZDemo',
      source: 'src/demo.tsx',
      props: {
        str: { type: 'string' },
        num: { type: 'number' },
        bool: { type: 'boolean' },
        arr: { type: 'array' },
        obj: { type: 'object' },
        unknown: { type: 'unknown' },
      },
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('str?: string')
    expect(code).toContain('num?: number')
    expect(code).toContain('bool?: boolean')
    expect(code).toContain('arr?: unknown[]')
    expect(code).toContain('obj?: Record<string, unknown>')
    expect(code).toContain('unknown?: unknown')
  })

  it('handles Element suffix in component name', () => {
    const code = generateComponentWCDts({
      tag: 'z-custom-element',
      name: 'ZCustomElement',
      exportName: 'ZCustomElement',
      source: 'src/custom-element.tsx',
      props: {},
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain(
      'export interface ZCustomElement extends HTMLElement',
    )
    expect(code).toContain('export interface ZCustomElementEventMap')
  })

  it('escapes hyphenated event names', () => {
    const code = generateComponentWCDts({
      tag: 'z-modal',
      name: 'ZModal',
      exportName: 'ZModal',
      source: 'src/modal.tsx',
      props: {},
      events: {
        'my-event': {
          detail: { value: 'string' },
        },
      },
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('"my-event": CustomEvent<{ value: string }>')
  })

  it('escapes hyphenated prop names', () => {
    const code = generateComponentWCDts({
      tag: 'z-input',
      name: 'ZInput',
      exportName: 'ZInput',
      source: 'src/input.tsx',
      props: {
        'my-prop': {
          type: 'string',
        },
      },
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('"my-prop"?: string')
  })

  it('generates typed event overloads and standard string overloads', () => {
    const code = generateComponentWCDts({
      tag: 'z-data-grid',
      name: 'DataGrid',
      exportName: 'DataGrid',
      source: 'src/data-grid.tsx',
      props: {},
      events: {
        selectionChange: {
          key: 'selectionChange',
          name: 'selectionChange',
          detail: {
            selection: 'unknown[]',
          },
        },
      },
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('export interface DataGridEventMap')
    expect(code).toContain(
      'selectionChange: CustomEvent<{ selection: unknown[] }>',
    )

    expect(code).toContain('addEventListener<K extends keyof DataGridEventMap>')
    expect(code).toContain(
      'listener: (this: DataGridElement, ev: DataGridEventMap[K]) => unknown,',
    )
    expect(code).toContain('options?: boolean | AddEventListenerOptions,')

    expect(code).toContain('addEventListener(')
    expect(code).toContain('type: string,')
    expect(code).toContain(
      'listener: EventListenerOrEventListenerObject | null,',
    )

    expect(code).toContain(
      'removeEventListener<K extends keyof DataGridEventMap>',
    )
    expect(code).toContain('options?: boolean | EventListenerOptions,')

    expect(code).toContain('removeEventListener(')
    expect(code).toContain('type: string,')
  })

  it('uses standard string overloads for components without custom events', () => {
    const code = generateComponentWCDts({
      tag: 'z-empty',
      name: 'ZEmpty',
      exportName: 'ZEmpty',
      source: 'src/empty.tsx',
      props: {},
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    })

    expect(code).toContain('export interface ZEmptyEventMap {')
    expect(code).not.toContain('[key: string]: CustomEvent<unknown>')

    expect(code).toContain('addEventListener<K extends keyof ZEmptyEventMap>')
    expect(code).toContain('addEventListener(')
    expect(code).toContain('type: string,')

    expect(code).toContain(
      'removeEventListener<K extends keyof ZEmptyEventMap>',
    )
    expect(code).toContain('removeEventListener(')
    expect(code).toContain('type: string,')
  })
})
