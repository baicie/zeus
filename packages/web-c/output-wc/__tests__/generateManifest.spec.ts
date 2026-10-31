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

  it.each([
    'nativeEvent',
    null,
    [42],
    ['missing'],
    ['nativeEvent', 'nativeEvent'],
    Array(1),
  ])('rejects invalid optional event detail metadata: %j', detailOptional => {
    const manifest = {
      schemaVersion: 1,
      components: [
        {
          tag: 'z-notice',
          name: 'Notice',
          exportName: 'Notice',
          source: 'notice.tsx',
          props: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
          events: {
            change: {
              detail: { value: 'string', nativeEvent: 'Event' },
              detailOptional,
            },
          },
        },
      ],
    }
    expect(() => validateComponentManifest(manifest as any)).toThrow(
      '[ZEUS_WC_EVENT_ABI]',
    )
  })

  it.each([
    [{ URLChange: {} }, '"-u-r-l-change", which is not a kebab-case'],
    [
      { change: { name: 'Value Change' } },
      '"Value Change", which is not a kebab-case',
    ],
    [{ change: { name: '' } }, '"", which is not a kebab-case'],
    [
      { valueChange: {}, change: { name: 'value-change' } },
      'events.change and components[0].events.valueChange both dispatch "value-change"',
    ],
  ])(
    'rejects malformed or duplicate DOM event names: %j',
    (events, message) => {
      const manifest = {
        schemaVersion: 1,
        components: [
          {
            tag: 'z-notice',
            name: 'Notice',
            exportName: 'Notice',
            source: 'notice.tsx',
            props: {},
            slots: {},
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
            events,
          },
        ],
      }
      expect(() => validateComponentManifest(manifest as any)).toThrow(
        `[ZEUS_WC_EVENT_NAME] components[0].events.`,
      )
      expect(() => validateComponentManifest(manifest as any)).toThrow(message)
    },
  )

  function noticeManifest(overrides: Record<string, unknown>) {
    return {
      schemaVersion: 1,
      components: [
        {
          tag: 'z-notice',
          name: 'Notice',
          exportName: 'Notice',
          source: 'notice.tsx',
          props: {},
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
          ...overrides,
        },
      ],
    } as any
  }

  it.each([
    [{ items: { type: 'array', attr: 'items' } }, 'ZEUS_WC_OBJECT_ATTRIBUTE'],
    [
      { onPick: { type: 'function', attr: 'on-pick' } },
      'ZEUS_WC_OBJECT_ATTRIBUTE',
    ],
    [{ config: { type: 'object', reflect: true } }, 'ZEUS_WC_REFLECT_CODEC'],
    [
      { tags: { type: 'array', reflect: true, serialize: true } },
      'ZEUS_WC_REFLECT_CODEC',
    ],
  ])(
    'rejects structured attribute and reflection without a codec: %j',
    (props, code) => {
      expect(() =>
        validateComponentManifest(noticeManifest({ props })),
      ).toThrow(`[${code}] components[0].props.`)
    },
  )

  it('accepts structured props whose attribute and reflection have a codec', () => {
    expect(() =>
      validateComponentManifest(
        noticeManifest({
          props: {
            tags: {
              type: 'array',
              attr: 'tags',
              reflect: true,
              serialize: true,
              deserialize: true,
            },
            open: { type: 'boolean', attr: false, reflect: true },
          },
        }),
      ),
    ).not.toThrow()
  })

  it.each([
    [{ prop: 'missing', event: 'value-change' }],
    [{ prop: 'value', event: 'value-input' }],
    [{ prop: 'value', event: 'value-change', eventPath: 'target.value' }],
    [{ prop: 'value', event: 'value-change', eventPath: 'detail.missing' }],
  ])('rejects a model that cannot be read: %j', model => {
    const manifest = noticeManifest({
      props: { value: { type: 'string' } },
      events: {
        valueChange: { name: 'value-change', detail: { value: 'string' } },
      },
      models: [model],
    })
    expect(() => validateComponentManifest(manifest)).toThrow(
      '[ZEUS_WC_MODEL] components[0].models[0]',
    )
  })

  it('accepts models bound to a dispatched event and a declared detail field', () => {
    const manifest = noticeManifest({
      props: { value: { type: 'string' } },
      events: {
        valueChange: { detail: { value: 'string' } },
      },
      models: [
        { prop: 'value', event: 'value-change', eventPath: 'detail.value' },
        { prop: 'value', event: 'value-change' },
      ],
    })
    expect(() => validateComponentManifest(manifest)).not.toThrow()
  })

  it('requires optional event fields to belong to an existing detail map', () => {
    const component = {
      tag: 'z-notice',
      name: 'Notice',
      exportName: 'Notice',
      source: 'notice.tsx',
      props: {},
      slots: {},
      hostAttributes: [],
      cssParts: [],
      cssVars: {},
      events: { change: { detailOptional: ['nativeEvent'] } },
    }
    expect(() =>
      validateComponentManifest({ schemaVersion: 1, components: [component] }),
    ).toThrow('[ZEUS_WC_EVENT_ABI]')
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
