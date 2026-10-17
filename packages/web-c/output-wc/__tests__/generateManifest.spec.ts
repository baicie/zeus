/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'

import {
  generateZeusComponentsManifest,
  validateComponentManifest,
} from '../src/generateManifest'

describe('generateManifest', () => {
  it('outputs formatted JSON manifest', () => {
    const manifest = {
      schemaVersion: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: {
            variant: {
              type: 'string' as const,
              values: ['default', 'outline'],
              default: 'default',
              reflect: true,
            },
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    }

    const result = generateZeusComponentsManifest(manifest as any)
    const parsed = JSON.parse(result)

    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.components).toHaveLength(1)
    expect(parsed.components[0].tag).toBe('z-button')
  })

  it('ends with trailing newline', () => {
    const result = generateZeusComponentsManifest({
      schemaVersion: 1,
      components: [],
    } as any)
    expect(result.endsWith('\n')).toBe(true)
  })

  it('pretty prints with 2-space indent', () => {
    const result = generateZeusComponentsManifest({
      schemaVersion: 1,
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
    } as any)

    expect(result).toContain('  "tag": "z-button"')
  })

  it('handles empty manifest', () => {
    const result = generateZeusComponentsManifest({
      schemaVersion: 1,
      components: [],
    } as any)
    const parsed = JSON.parse(result)
    expect(parsed.schemaVersion).toBe(1)
    expect(parsed.components).toEqual([])
  })

  it('rejects the removed version field and unsupported ABI values', () => {
    expect(() =>
      generateZeusComponentsManifest({
        version: 1,
        components: [],
      } as any),
    ).toThrow('[ZEUS_WC_ABI_VERSION]')

    expect(() =>
      validateComponentManifest({
        schemaVersion: 1,
        components: [
          {
            tag: 'z-invalid',
            name: 'ZInvalid',
            exportName: 'ZInvalid',
            source: 'src/invalid.tsx',
            props: {
              value: {
                type: 'string',
                default: () => 'not serializable',
                defaultStrategy: 'factory',
              },
            },
            events: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      }),
    ).toThrow('[ZEUS_WC_INVALID_DEFAULT_META]')
  })

  it('rejects duplicate tags and attribute aliases', () => {
    const component = {
      tag: 'z-input',
      name: 'ZInput',
      exportName: 'ZInput',
      source: 'src/input.tsx',
      props: { value: { type: 'string' as const, attr: 'value' } },
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    }

    expect(() =>
      validateComponentManifest({
        schemaVersion: 1,
        components: [component, { ...component, name: 'ZInputCopy' }],
      }),
    ).toThrow('[ZEUS_WC_DUPLICATE_TAG]')

    expect(() =>
      validateComponentManifest({
        schemaVersion: 1,
        components: [
          {
            ...component,
            props: {
              value: { type: 'string' as const, attr: 'value' },
              label: { type: 'string' as const, attr: 'value' },
            },
          },
        ],
      }),
    ).toThrow('[ZEUS_WC_ATTR_COLLISION]')
  })

  it('rejects non-serializable event, slot, method, and style metadata', () => {
    const base = {
      tag: 'z-contract',
      name: 'ZContract',
      exportName: 'ZContract',
      source: 'src/contract.tsx',
      props: {},
      events: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
    }
    const manifest = (component: Record<string, unknown>) => ({
      schemaVersion: 1 as const,
      components: [{ ...base, ...component }],
    })

    expect(() =>
      validateComponentManifest(
        manifest({ events: { change: { detail: { value: () => 1 } } } }) as any,
      ),
    ).toThrow('[ZEUS_WC_INVALID_MANIFEST]')
    expect(() =>
      validateComponentManifest(
        manifest({ slots: { header: { description: Symbol('slot') } } }) as any,
      ),
    ).toThrow('[ZEUS_WC_INVALID_MANIFEST]')
    expect(() =>
      validateComponentManifest(
        manifest({
          methods: {
            run: { name: 'run', returns: Reflect.get(globalThis, 'BigInt')(1) },
          },
        }) as any,
      ),
    ).toThrow('[ZEUS_WC_INVALID_MANIFEST]')
    expect(() =>
      validateComponentManifest(
        manifest({
          cssVars: { '--gap': { name: '--gap', value: new Date() } },
        }) as any,
      ),
    ).toThrow('[ZEUS_WC_INVALID_MANIFEST]')
  })

  it('preserves all component fields', () => {
    const manifest = {
      schemaVersion: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          description: 'A button component',
          props: {
            variant: {
              type: 'string' as const,
              values: ['default', 'outline'],
              default: 'default',
              reflect: true,
              description: 'Button variant',
            },
          },
          events: {
            press: {
              detail: { x: 'number', y: 'number' },
            },
          },
          slots: {
            default: { description: 'Button content' },
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
    }

    const result = generateZeusComponentsManifest(manifest as any)
    const parsed = JSON.parse(result)

    expect(parsed.components[0].description).toBe('A button component')
    expect(parsed.components[0].events.press.detail).toEqual({
      x: 'number',
      y: 'number',
    })
    expect(parsed.components[0].slots.default.description).toBe(
      'Button content',
    )
    expect(parsed.components[0].hostAttributes).toContain('data-state')
    expect(parsed.components[0].cssParts).toContain('root')
    expect(parsed.components[0].cssVars).toHaveProperty('--z-button-bg')
  })
})
