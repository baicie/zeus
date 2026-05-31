import { describe, expect, it } from 'vitest'

import { generateWCDts, generateWCJsxDts } from '../src/generateDts'

import type { ComponentPropType } from '@zeus-js/component-analyzer'

describe('generateDts', () => {
  it('generates HTMLElementTagNameMap declarations', () => {
    const code = generateWCDts({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: {
            variant: {
              type: 'string',
              values: ['default', 'outline'],
            },
            disabled: {
              type: 'boolean',
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
      ],
    })

    expect(code).toContain(
      'export interface ZButtonElement extends HTMLElement',
    )
    expect(code).toContain('variant?: "default" | "outline"')
    expect(code).toContain('disabled?: boolean')
    expect(code).toContain('"z-button": ZButtonElement')
  })

  it('generates JSX intrinsic declarations', () => {
    const code = generateWCJsxDts({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: {
            variant: {
              type: 'string',
              values: ['default', 'outline'],
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
      ],
    })

    expect(code).toContain('namespace JSX')
    expect(code).toContain('"z-button"')
    expect(code).toContain('variant?: "default" | "outline"')
  })

  it('marks required props without ?', () => {
    const code = generateWCDts({
      version: 1,
      components: [
        {
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
          cssVars: [],
        },
      ],
    })

    expect(code).toContain('value: string')
    expect(code).not.toContain('value?: string')
    expect(code).toContain('label?: string')
    expect(code).toContain('count?: number')
  })

  it('generates multiple component interfaces', () => {
    const code = generateWCDts({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: { label: { type: 'string' } },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
        {
          tag: 'z-card',
          name: 'ZCard',
          exportName: 'ZCard',
          source: 'src/card.tsx',
          props: { title: { type: 'string' } },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
      ],
    })

    expect(code).toContain(
      'export interface ZButtonElement extends HTMLElement',
    )
    expect(code).toContain('export interface ZCardElement extends HTMLElement')
    expect(code).toContain('"z-button": ZButtonElement')
    expect(code).toContain('"z-card": ZCardElement')
  })

  it('handles all prop type variants', () => {
    const code = generateWCDts({
      version: 1,
      components: [
        {
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
            unknown: { type: 'other' as ComponentPropType },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
      ],
    })

    expect(code).toContain('str?: string')
    expect(code).toContain('num?: number')
    expect(code).toContain('bool?: boolean')
    expect(code).toContain('arr?: unknown[]')
    expect(code).toContain('obj?: Record<string, unknown>')
    expect(code).toContain('unknown?: unknown')
  })

  it('JSX declaration includes common HTML attributes', () => {
    const code = generateWCJsxDts({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: { label: { type: 'string' } },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: [],
        },
      ],
    })

    expect(code).toContain('children?: unknown')
    expect(code).toContain('class?: string')
    expect(code).toContain('className?: string')
    expect(code).toContain('style?: string | Record<string, string | number>')
  })

  it('ends with export {}', () => {
    const code = generateWCDts({
      version: 1,
      components: [],
    })
    expect(code.trimEnd()).toMatch(/export \{\}[\s\n]*$/)
  })
})
