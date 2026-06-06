/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'

import { generateCustomElementsJson } from '../src/generateCustomElementsJson'

describe('generateCustomElementsJson', () => {
  it('generates custom-elements.json', () => {
    const source = generateCustomElementsJson({
      manifest: {
        version: 1,
        components: [
          {
            tag: 'z-button',
            name: 'ZButton',
            exportName: 'ZButton',
            source: 'src/button.tsx',
            description: 'Button primitive',
            props: {
              variant: {
                type: 'string',
                values: ['default', 'outline'],
                default: 'default',
                reflect: true,
                description: 'Button variant.',
              },
              disabled: {
                type: 'boolean',
                default: false,
                reflect: true,
              },
            },
            events: {
              press: {
                detail: {
                  nativeEvent: 'MouseEvent',
                },
              },
            },
            slots: {
              default: {
                description: 'Button content.',
              },
            },
            hostAttributes: ['data-state'],
            cssParts: ['root'],
            cssVars: {
              '--z-button-bg': {
                name: '--z-button-bg',
              },
            },
          },
        ],
      },
      getModulePath: () => 'dist/wc/z-button.js',
    })

    expect(JSON.parse(source)).toMatchObject({
      schemaVersion: '1.0.0',
      modules: [
        {
          kind: 'javascript-module',
          path: 'dist/wc/z-button.js',
          declarations: [
            {
              kind: 'class',
              name: 'ZButtonElement',
              tagName: 'z-button',
              customElement: true,
              description: 'Button primitive',
              attributes: [
                {
                  name: 'variant',
                  type: {
                    text: '"default" | "outline"',
                  },
                  default: '"default"',
                },
                {
                  name: 'disabled',
                  type: {
                    text: 'boolean',
                  },
                  default: 'false',
                },
              ],
              events: [
                {
                  name: 'press',
                  type: {
                    text: 'CustomEvent<{ nativeEvent: MouseEvent }>',
                  },
                },
              ],
              slots: [
                {
                  name: '',
                  description: 'Button content.',
                },
              ],
              cssParts: [
                {
                  name: 'root',
                },
              ],
              cssProperties: [
                {
                  name: '--z-button-bg',
                },
              ],
            },
          ],
        },
      ],
    })
  })

  it('skips props with attr: false from attributes', () => {
    const source = generateCustomElementsJson({
      manifest: {
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
                attr: false,
              },
              label: {
                type: 'string',
              },
            },
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      getModulePath: () => 'dist/wc/z-input.js',
    })

    const parsed = JSON.parse(source)
    const attrs = parsed.modules[0].declarations[0].attributes

    expect(attrs).toHaveLength(1)
    expect(attrs[0].name).toBe('label')
    expect(attrs.find((a: any) => a.name === 'value')).toBeUndefined()
  })

  it('uses custom attr name when specified as string', () => {
    const source = generateCustomElementsJson({
      manifest: {
        version: 1,
        components: [
          {
            tag: 'z-input',
            name: 'ZInput',
            exportName: 'ZInput',
            source: 'src/input.tsx',
            props: {
              maxLength: {
                type: 'number',
                attr: 'maxlength',
              },
            },
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      getModulePath: () => 'dist/wc/z-input.js',
    })

    const attrs = JSON.parse(source).modules[0].declarations[0].attributes
    expect(attrs[0].name).toBe('maxlength')
  })

  it('converts camelCase prop name to kebab-case attribute', () => {
    const source = generateCustomElementsJson({
      manifest: {
        version: 1,
        components: [
          {
            tag: 'z-input',
            name: 'ZInput',
            exportName: 'ZInput',
            source: 'src/input.tsx',
            props: {
              tabIndex: {
                type: 'number',
              },
            },
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      getModulePath: () => 'dist/wc/z-input.js',
    })

    const attrs = JSON.parse(source).modules[0].declarations[0].attributes
    expect(attrs[0].name).toBe('tab-index')
  })

  it('includes exports section with correct declaration reference', () => {
    const source = generateCustomElementsJson({
      manifest: {
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
      getModulePath: () => 'dist/wc/z-button.js',
    })

    const parsed = JSON.parse(source)
    const exp = parsed.modules[0].exports[0]

    expect(exp.kind).toBe('js')
    expect(exp.name).toBe('ZButton')
    expect(exp.declaration.name).toBe('ZButtonElement')
    expect(exp.declaration.module).toBe('dist/wc/z-button.js')
  })

  it('normalizes module paths (backslashes)', () => {
    const source = generateCustomElementsJson({
      manifest: {
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
      getModulePath: () => 'C:\\project\\dist\\wc\\z-button.js',
    })

    const parsed = JSON.parse(source)
    expect(parsed.modules[0].path).not.toContain('\\')
    expect(parsed.modules[0].path).toBe('C:/project/dist/wc/z-button.js')
  })

  it('handles named slots correctly', () => {
    const source = generateCustomElementsJson({
      manifest: {
        version: 1,
        components: [
          {
            tag: 'z-card',
            name: 'ZCard',
            exportName: 'ZCard',
            source: 'src/card.tsx',
            props: {},
            events: {},
            slots: {
              default: { description: 'Card content.' },
              header: { description: 'Card header slot.' },
            },
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      getModulePath: () => 'dist/wc/z-card.js',
    })

    const slots = JSON.parse(source).modules[0].declarations[0].slots

    expect(slots).toHaveLength(2)
    const defaultSlot = slots.find(
      (s: any) => s.description === 'Card content.',
    )
    expect(defaultSlot.name).toBe('')
    const headerSlot = slots.find(
      (s: any) => s.description === 'Card header slot.',
    )
    expect(headerSlot.name).toBe('header')
  })

  it('handles empty component fields', () => {
    const source = generateCustomElementsJson({
      manifest: {
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
      getModulePath: () => 'dist/wc/z-button.js',
    })

    const decl = JSON.parse(source).modules[0].declarations[0]
    expect(decl.attributes).toEqual([])
    expect(decl.members).toEqual([])
    expect(decl.events).toEqual([])
    expect(decl.slots).toEqual([])
    expect(decl.cssParts).toEqual([])
    expect(decl.cssProperties).toEqual([])
  })

  it('handles props without values (primitive types)', () => {
    const source = generateCustomElementsJson({
      manifest: {
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
              unknown: { type: 'other' as any },
            },
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      getModulePath: () => 'dist/wc/z-demo.js',
    })

    const members = JSON.parse(source).modules[0].declarations[0].members

    const texts = members.map((m: any) => m.type.text)
    expect(texts).toContain('string')
    expect(texts).toContain('number')
    expect(texts).toContain('boolean')
    expect(texts).toContain('unknown[]')
    expect(texts).toContain('Record<string, unknown>')
    expect(texts).toContain('unknown')
  })
})
