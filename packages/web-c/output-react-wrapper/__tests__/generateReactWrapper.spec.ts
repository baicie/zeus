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
        cssVars: {},
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

  it('passes component props through rest props in minimal mode', () => {
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
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-button',
      mode: 'minimal',
    })

    // All component props stay in rest props, not destructured.
    expect(code).toContain('const rest = omitProps(props')
    expect(code).toContain('rest.ref = ref')
    expect(code).toContain('!OMITTED_PROPS.has(key)')
    expect(code).not.toContain('...rest')
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
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-button',
      mode: 'event-bridge',
    })

    expect(code).toContain('import "zeus:wc:z-button"')
    expect(code).toContain('export const ZButton = forwardRef(function ZButton')
    expect(code).toContain('const props = inputProps || {}')
    expect(code).toContain('const rest = omitProps(props')
    expect(code).toContain('useImperativeHandle(ref')
    expect(code).toContain('const innerRef = useRef(null)')
    expect(code).toContain('const previousPropPresenceRef = useRef([])')
    expect(code).toContain('const previousPropValuesRef = useRef([])')
    expect(code).toContain('const eventHandlersRef = useRef([])')

    // Props are synced conditionally via hasOwnProperty check
    expect(code).toContain('const propPresent0 = hasOwn(props, "variant")')
    expect(code).toContain('const propPresent1 = hasOwn(props, "disabled")')
    expect(code).toContain('previousPropPresence[0] = true')
    expect(code).toContain('previousPropPresence[0] = false')
    expect(code).toContain('previousPropPresence[1] = true')
    expect(code).toContain('previousPropPresence[1] = false')
    expect(code).toContain('!Object.is(previousPropValues[0], propValue0)')

    expect(code).toContain('const EVENT_NAMES = ["press"]')
    expect(code).toContain('el.addEventListener(EVENT_NAMES[index]')
    expect(code).toContain('el.removeEventListener(EVENT_NAMES[index]')
    expect(code).toContain('eventHandlersRef.current[0]')

    expect(code).not.toContain('slotChildren = []')
    expect(code).toContain('return createElement("z-button", rest, children)')

    expect(code).not.toContain('createNamedSlot')
    expect(code).not.toContain('...rest')

    expect(code).not.toContain('PROP_KEYS')
    expect(code).not.toContain('EVENT_MAP')
    expect(code).not.toContain('NAMED_SLOTS')
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
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-card',
      mode: 'minimal',
    })

    expect(code).toContain('slotValue0')
    expect(code).toContain('slotValue1')
    expect(code).toContain('"header"')
    expect(code).toContain('"footer"')
    expect(code).toContain('React.cloneElement')
    expect(code).toContain('slot: "header"')
    expect(code).toContain('slot: "footer"')
    expect(code).toContain("{ display: 'contents' }")
    expect(code).toContain('pushAll(childArgs, slotNodes)')
    expect(code).not.toContain('useRef')
    expect(code).not.toContain('addEventListener')
  })

  it('generates valid code for kebab-case named slots', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-card',
        name: 'ZCard',
        exportName: 'ZCard',
        source: 'src/card.tsx',
        props: {},
        events: {},
        slots: {
          default: {},
          'header-actions': {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-card',
      mode: 'minimal',
    })

    // Must use quoted string lookup, not bare identifier.
    expect(code).toContain('const slotValue0 = props["header-actions"]')
    // Must NOT contain bare identifier that would be a syntax error
    expect(code).not.toContain('header-actions,')
    expect(code).not.toContain('header-actions:')
    expect(code).not.toContain('slotNode_header-actions')
    // The slot attribute value must still be correct
    expect(code).toContain('slot: "header-actions"')
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
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-skeleton',
      mode: 'event-bridge',
    })

    expect(code).not.toContain('previousPropKeysRef')
    expect(code).not.toContain('previousPropValuesRef')
    expect(code).not.toContain('useEffect')
    expect(code).not.toContain('useImperativeHandle')
  })

  it('does not overwrite omitted props in event-bridge mode', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-button',
        name: 'ZButton',
        exportName: 'ZButton',
        source: 'src/button.tsx',
        props: {
          variant: {
            type: 'string',
            default: 'default',
          },
        },
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-button',
      mode: 'event-bridge',
    })

    expect(code).toContain('const propPresent0 = hasOwn(props, "variant")')
    expect(code).toContain('previousPropPresence[0] = true')
    expect(code).toContain('previousPropPresence[0] = false')
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
        cssVars: {},
      },
      namedSlots: 'none',
      wcModuleId: 'zeus:wc:z-tag',
      mode: 'event-bridge',
    })

    expect(code).not.toContain('NAMED_SLOTS')
    expect(code).not.toContain('"label"')
  })

  it('generates valid event-bridge code for kebab-case event names', () => {
    const code = generateReactWrapper({
      component: {
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
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-input',
      mode: 'event-bridge',
    })

    expect(code).toContain('const eventHandler0 = props["onValueChange"]')
    expect(code).toContain('const EVENT_NAMES = ["value-change"]')
    expect(code).toContain('eventHandlersRef.current[0]')
    expect(code).not.toContain('eventHandlervalue-change')
  })

  it('registers all custom event listeners in one stable effect', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-input',
        name: 'ZInput',
        exportName: 'ZInput',
        source: 'src/input.tsx',
        props: {},
        events: {
          focusChange: {},
          valueChange: {},
        },
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: 'zeus:wc:z-input',
      mode: 'event-bridge',
    })

    expect(code.match(/useEffect\(\(\) =>/g)).toHaveLength(1)
    expect(code).toContain('eventHandlersRef.current[0] = eventHandler0')
    expect(code).toContain('eventHandlersRef.current[1] = eventHandler1')
    expect(code).toContain(
      'const EVENT_NAMES = ["focus-change","value-change"]',
    )
    expect(code).toContain('el.addEventListener(EVENT_NAMES[index]')
    expect(code).toContain('}, [])')
  })

  it('generates runtime mode React proxy using @zeus-js/output-react-wrapper/runtime', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-button',
        name: 'ZButton',
        exportName: 'ZButton',
        source: 'src/button.tsx',
        props: {
          variant: { type: 'string' },
          disabled: { type: 'boolean' },
        },
        events: {
          press: {},
        },
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: '../wc/loader.js',
      mode: 'runtime',
    })

    expect(code).toContain("import React from 'react'")
    expect(code).toContain(
      "import { createComponent } from '@zeus-js/output-react-wrapper/runtime'",
    )
    expect(code).toContain(
      "import { defineCustomElement } from '../wc/loader.js'",
    )
    expect(code).toContain('export const ZButton = createComponent')
    expect(code).toContain('tagName: "z-button"')
    expect(code).toContain(
      'defineCustomElement: () => defineCustomElement("z-button")',
    )
    expect(code).toContain('"onPress": "press"')
    expect(code).toContain('slots: []')

    expect(code).not.toContain('import "zeus:wc:z-button"')
    expect(code).not.toContain('useEffect')
    expect(code).not.toContain('addEventListener')
  })

  it('passes named slot prop names to runtime mode React proxy', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-input',
        name: 'ZInput',
        exportName: 'ZInput',
        source: 'src/input.tsx',
        props: {
          value: { type: 'string' },
        },
        events: {},
        slots: {
          default: {},
          prefix: {},
          suffix: {},
          message: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: '../wc/loader.js',
      mode: 'runtime',
    })

    expect(code).toContain('slots: ["prefix","suffix","message"]')
  })

  it('maps kebab-case events to React camelCase props in runtime mode', () => {
    const code = generateReactWrapper({
      component: {
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
      namedSlots: 'props',
      wcModuleId: '../wc/loader.js',
      mode: 'runtime',
    })

    expect(code).toContain('"onValueChange": "value-change"')
  })

  it('handles component with no events in runtime mode', () => {
    const code = generateReactWrapper({
      component: {
        tag: 'z-skeleton',
        name: 'ZSkeleton',
        exportName: 'ZSkeleton',
        source: 'src/skeleton.tsx',
        props: {},
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      namedSlots: 'props',
      wcModuleId: '../wc/loader.js',
      mode: 'runtime',
    })

    expect(code).toContain('events: {}')
    expect(code).not.toContain('import "zeus:wc:z-skeleton"')
    expect(code).not.toContain('useEffect')
  })
})
