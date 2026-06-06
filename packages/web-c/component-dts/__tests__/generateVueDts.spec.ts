import { describe, expect, it } from 'vitest'

import { generateVueDts, generateVueGlobalDts } from '../src/generateVueDts'

describe('generateVueDts', () => {
  it('includes Vue model update event types', () => {
    const code = generateVueDts({
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
            },
          },
          events: {
            valueChange: {
              name: 'value-change',
            },
          },
          models: [
            {
              prop: 'value',
              event: 'value-change',
              eventPath: 'detail.value',
            },
          ],
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    })

    expect(code).toContain('"update:value": (value: string) => void')
  })

  it('generates Vue wrapper dts', () => {
    const code = generateVueDts({
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

    expect(code).toContain(`import type { DefineComponent } from 'vue'`)
    expect(code).toContain('export interface ZButtonProps')
    expect(code).toContain(
      '"press": (event: CustomEvent<{ nativeEvent: MouseEvent }>) => void',
    )
    expect(code).toContain('export declare const ZButton: DefineComponent<')
  })

  it('handles event with no detail', () => {
    const code = generateVueDts({
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

    expect(code).toContain('"change": (event: CustomEvent<unknown>) => void')
  })

  it('handles no events with empty emits', () => {
    const code = generateVueDts({
      version: 1,
      components: [
        {
          tag: 'z-simple',
          name: 'ZSimple',
          exportName: 'ZSimple',
          source: 'src/simple.tsx',
          props: {},
          events: {},
          slots: {},
          hostAttributes: [],
          cssParts: [],
          cssVars: {},
        },
      ],
    })

    expect(code).toContain('{}')
  })
})

describe('generateVueGlobalDts', () => {
  it('generates Vue global component declarations', () => {
    const code = generateVueGlobalDts({
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

    expect(code).toContain(`declare module 'vue'`)
    expect(code).toContain('ZButton: typeof ZButton')
  })

  it('generates global declarations for multiple components', () => {
    const code = generateVueGlobalDts({
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

    expect(code).toContain('ZButton: typeof ZButton')
    expect(code).toContain('ZCard: typeof ZCard')
  })
})
