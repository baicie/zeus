import { describe, expect, it } from 'vitest'

import { generateReactWrapper } from '../src/generateReactWrapper'

describe('generateReactWrapper', () => {
  it('generates minimal React wrapper code by default', () => {
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
      mode: 'minimal',
    })

    // minimal wrapper imports wcModuleId to bootstrap Proxy Elements
    expect(code).toContain('import "zeus:wc:z-button"')
    expect(code).toContain('export const ZButton = React.forwardRef')
    expect(code).not.toContain('useImperativeHandle')
    expect(code).not.toContain('useRef')
    expect(code).not.toContain('el.variant = variant')
    expect(code).not.toContain('addEventListener')
    expect(code).toContain('React.createElement')
  })

  it('passes component props through ...rest in minimal mode', () => {
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
        events: {},
        slots: {
          default: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: [],
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-button',
      mode: 'minimal',
    })

    // All component props stay in ...rest, not destructured
    expect(code).toContain('...rest')
    expect(code).not.toContain('variant,')
    expect(code).not.toContain('disabled,')
    expect(code).toContain('import "zeus:wc:z-button"')
  })

  it('generates event-bridge React wrapper code', () => {
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
      mode: 'event-bridge',
    })

    expect(code).toContain('import "zeus:wc:z-button"')
    expect(code).toContain('export const ZButton = forwardRef(function ZButton')
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

  it('handles component with named slots in minimal mode', () => {
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
      mode: 'minimal',
    })

    expect(code).toContain('slotNode_header')
    expect(code).toContain('slotNode_footer')
    expect(code).toContain('"header"')
    expect(code).toContain('"footer"')
    expect(code).toContain('React.cloneElement')
    expect(code).toContain('slot: "header"')
    expect(code).toContain('slot: "footer"')
    expect(code).toContain("{ display: 'contents' }")
    expect(code).not.toContain('useRef')
    expect(code).not.toContain('addEventListener')
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
      mode: 'event-bridge',
    })

    expect(code).toContain('// no props')
  })

  it('handles namedSlots option none in event-bridge mode', () => {
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
      mode: 'event-bridge',
    })

    expect(code).toContain('NAMED_SLOTS')
    expect(code).not.toContain('"label"')
  })
})
