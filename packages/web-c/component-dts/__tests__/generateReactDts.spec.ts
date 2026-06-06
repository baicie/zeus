import { describe, expect, it } from 'vitest'

import { generateReactDts } from '../src/generateReactDts'

describe('generateReactDts', () => {
  it('generates React wrapper dts', () => {
    const code = generateReactDts({
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
        },
      ],
    })

    expect(code).toContain(`import type * as React from 'react'`)
    expect(code).toContain('export interface ZButtonProps')
    expect(code).toContain(
      'onPress?: (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void',
    )
    expect(code).toContain('React.ForwardRefExoticComponent')
  })

  it('includes common React attributes', () => {
    const code = generateReactDts({
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
    })

    expect(code).toContain('children?: React.ReactNode')
    expect(code).toContain('className?: string')
    expect(code).toContain('style?: React.CSSProperties')
  })

  it('handles event with no detail', () => {
    const code = generateReactDts({
      version: 1,
      components: [
        {
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
        },
      ],
    })

    expect(code).toContain('onChange?: (event: CustomEvent<unknown>) => void')
  })

  it('generates multiple components', () => {
    const code = generateReactDts({
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
    expect(code).toContain('export declare const ZButton:')
    expect(code).toContain('export declare const ZCard:')
  })

  it('generates valid property names for kebab-case events', () => {
    const code = generateReactDts({
      version: 1,
      components: [
        {
          tag: 'z-input',
          name: 'ZInput',
          exportName: 'ZInput',
          source: 'src/input.tsx',
          props: {},
          events: {
            'value-change': {},
          },
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    })

    expect(code).toContain(
      'onValueChange?: (event: CustomEvent<unknown>) => void',
    )
    expect(code).not.toContain('value-change')
  })

  it('omits named slot props when namedSlots is none', () => {
    const code = generateReactDts(
      {
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
              default: {},
              header: {},
              footer: {},
            },
            hostAttributes: [],
            cssParts: [],
            cssVars: {},
          },
        ],
      },
      { namedSlots: 'none' },
    )

    expect(code).toContain('export interface ZCardProps')
    expect(code).not.toContain('header')
    expect(code).not.toContain('footer')
    expect(code).toContain('children?: React.ReactNode')
  })

  it('includes named slot props by default', () => {
    const code = generateReactDts({
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
            default: {},
            header: {},
            footer: {},
          },
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    })

    expect(code).toContain('header?: React.ReactNode')
    expect(code).toContain('footer?: React.ReactNode')
    expect(code).not.toContain('default')
  })
})
