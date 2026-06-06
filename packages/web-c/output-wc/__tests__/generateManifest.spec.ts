/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'

import { generateZeusComponentsManifest } from '../src/generateManifest'

describe('generateManifest', () => {
  it('outputs formatted JSON manifest', () => {
    const manifest = {
      version: 1,
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

    expect(parsed.version).toBe(1)
    expect(parsed.components).toHaveLength(1)
    expect(parsed.components[0].tag).toBe('z-button')
  })

  it('ends with trailing newline', () => {
    const result = generateZeusComponentsManifest({
      version: 1,
      components: [],
    } as any)
    expect(result.endsWith('\n')).toBe(true)
  })

  it('pretty prints with 2-space indent', () => {
    const result = generateZeusComponentsManifest({
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
    } as any)

    expect(result).toContain('  "tag": "z-button"')
  })

  it('handles empty manifest', () => {
    const result = generateZeusComponentsManifest({
      version: 1,
      components: [],
    } as any)
    const parsed = JSON.parse(result)
    expect(parsed.version).toBe(1)
    expect(parsed.components).toEqual([])
  })

  it('preserves all component fields', () => {
    const manifest = {
      version: 1,
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
