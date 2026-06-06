import { describe, expect, it } from 'vitest'

import { generateWCJsxDts } from '../src/generateJsxDts'

describe('generateWCJsxDts', () => {
  it('generates JSX intrinsic elements', () => {
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
          cssVars: {},
        },
      ],
    })

    expect(code).toContain('namespace JSX')
    expect(code).toContain('"z-button": ZButtonProps')
    expect(code).toContain('variant?: "default" | "outline"')
    expect(code).toContain('[key: `data-${string}`]: unknown')
    expect(code).toContain('[key: `aria-${string}`]: unknown')
  })

  it('generates JSX props with common HTML attributes', () => {
    const code = generateWCJsxDts({
      version: 1,
      components: [
        {
          tag: 'z-button',
          name: 'ZButton',
          exportName: 'ZButton',
          source: 'src/button.tsx',
          props: {
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
    })

    expect(code).toContain('export interface ZButtonProps')
    expect(code).toContain('children?: unknown')
    expect(code).toContain('class?: string')
    expect(code).toContain('className?: string')
    expect(code).toContain(
      'style?: string | Record<string, string | number | null | undefined>',
    )
    expect(code).toContain('id?: string')
    expect(code).toContain('role?: string')
    expect(code).toContain('part?: string')
    expect(code).toContain('slot?: string')
  })

  it('generates multiple component JSX types', () => {
    const code = generateWCJsxDts({
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
    })

    expect(code).toContain('export interface ZButtonProps')
    expect(code).toContain('export interface ZCardProps')
    expect(code).toContain('"z-button": ZButtonProps')
    expect(code).toContain('"z-card": ZCardProps')
  })

  it('marks required props without ?', () => {
    const code = generateWCJsxDts({
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
          },
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    })

    expect(code).toContain('value: string')
    expect(code).not.toContain('value?: string')
  })

  it('escapes hyphenated tag names', () => {
    const code = generateWCJsxDts({
      version: 1,
      components: [
        {
          tag: 'z-my-button',
          name: 'ZMyButton',
          exportName: 'ZMyButton',
          source: 'src/my-button.tsx',
          props: {},
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    })

    expect(code).toContain('"z-my-button": ZMyButtonProps')
  })
})
