import { describe, expect, it } from 'vitest'

import { generateReactWrapper } from '../src/generateReactWrapper'

describe('generateReactWrapper', () => {
  it('generates React wrapper code', () => {
    const code = generateReactWrapper({
      component: {
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
        events: {
          press: {
            detail: {
              nativeEvent: 'MouseEvent',
            },
          },
        },
        slots: {
          default: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-button',
    })

    expect(code).toContain('import "zeus:wc:z-button"')
    expect(code).toContain(
      'export const ZButton = applyRefForwarding(function ZButton',
    )
    expect(code).toContain('return forwardRef(Component)')
    expect(code).toContain('useImperativeHandle(ref')
    expect(code).toContain('const innerRef = useRef(null)')

    expect(code).toContain('el.variant = variant')
    expect(code).toContain('el.disabled = disabled')

    expect(code).toContain('addEventListener("press"')
    expect(code).toContain('removeEventListener("press"')
    expect(code).toContain('onPress(event)')

    expect(code).toContain('slotChildren = []')
    expect(code).toContain('slotChildren.push(children)')
    expect(code).toContain('return createElement(')

    expect(code).toContain('createNamedSlot')

    expect(code).toContain('PROP_KEYS')
    expect(code).toContain('EVENT_MAP')
    expect(code).toContain('NAMED_SLOTS')
  })

  it('handles component with named slots', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-card',
        name: 'ZCard',
        exportName: 'ZCard',
        source: 'src/card.tsx',
        props: {
          title: { type: 'string' },
        },
        events: {},
        slots: {
          default: {},
          header: {},
          footer: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-card',
    })

    expect(code).toContain('NAMED_SLOTS')
    expect(code).toContain('"header"')
    expect(code).toContain('"footer"')
    expect(code).toContain('createNamedSlot')
    expect(code).toContain('slot: name')
    expect(code).toContain("{ display: 'contents' }")
  })

  it('handles component with no props', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-skeleton',
        name: 'ZSkeleton',
        exportName: 'ZSkeleton',
        source: 'src/skeleton.tsx',
        props: {},
        events: {},
        slots: {
          default: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-skeleton',
    })

    expect(code).toContain('// no props')
  })

  it('handles namedSlots option none', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-tag',
        name: 'ZTag',
        exportName: 'ZTag',
        source: 'src/tag.tsx',
        props: {},
        events: {},
        slots: {
          default: {},
          label: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
      namedSlots: 'none',
      wcModuleId: 'zeus:wc:z-tag',
    })

    expect(code).toContain('NAMED_SLOTS')
    expect(code).not.toContain('"label"')
  })
})
