import { describe, expect, it } from 'vitest'

import { generateVueWrapper } from '../src/generateVueWrapper'

describe('generateVueWrapper', () => {
  it('bridges declared component models to Vue update events', () => {
    const code = generateVueWrapper({
      component: {
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
      wcModuleId: '@demo/components',
      mode: 'minimal',
    })

    expect(code).toContain('"update:value"')
    expect(code).toContain('readEventPath(event, model.eventPath)')
    expect(code).toContain('emit(model.updateEvent')
    expect(code).toContain('"detail.value"')
  })

  it('generates event-bridge Vue wrapper code', () => {
    const code = generateVueWrapper({
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
      wcModuleId: 'zeus:wc:z-button',
      mode: 'event-bridge',
    })

    expect(code).toContain('import "zeus:wc:z-button"')
    expect(code).toContain('export const ZButton = defineComponent')
    expect(code).toContain('name: "ZButton"')
    expect(code).toContain('props: {')
    expect(code).toContain('emits: EVENT_NAMES')
    expect(code).toContain('const elRef = ref(null)')

    expect(code).toContain('getCurrentInstance')
    expect(code).toContain(
      'const rawProps = instance?.vnode.props || EMPTY_PROPS',
    )
    expect(code).toContain('const nextValue = props[name]')
    expect(code).toContain('const syncedPropValues = []')
    expect(code).toContain('!Object.is(syncedPropValues[index], nextValue)')
    expect(code).not.toContain('el.variant = props.variant')
    expect(code).not.toContain('el.disabled = props.disabled')

    expect(code).toContain('for (let index = 0; index < EVENT_NAMES.length')
    expect(code).toContain('emit(eventName, event)')
    expect(code).toContain(
      'mountedEl.addEventListener(EVENT_NAMES[index], eventHandlers[index])',
    )
    expect(code).toContain(
      'mountedEl.removeEventListener(EVENT_NAMES[index], eventHandlers[index])',
    )

    expect(code).toContain('onUpdated(syncProps)')
    expect(code).not.toContain('watch(')

    expect(code).toContain('onBeforeUnmount')
    expect(code).toContain('for (let index = 0; index < EVENT_NAMES.length')

    expect(code).toContain('slots.default')
    expect(code).toContain('h(')
    expect(code).toContain('const hostProps = Object.assign({}, attrs)')
    expect(code).toContain('hostProps.ref = elRef')
    expect(code).not.toContain('withSlot')

    expect(code).toContain('PROP_KEYS')
    expect(code).toContain('PROP_INPUT_KEYS')
    expect(code).toContain('EVENT_NAMES')
    expect(code).not.toContain('NAMED_SLOTS')
  })

  it('does not sync omitted props in event-bridge mode', () => {
    const code = generateVueWrapper({
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
      wcModuleId: 'zeus:wc:z-button',
      mode: 'event-bridge',
    })

    expect(code).toContain('getCurrentInstance')
    expect(code).toContain('hasOwn(rawProps, key)')
    expect(code).toContain('const nextValue = props[name]')
    expect(code).not.toContain('el.variant = props.variant')
  })

  it('generates valid event-bridge code for kebab-case props', () => {
    const code = generateVueWrapper({
      component: {
        tag: 'z-button',
        name: 'ZButton',
        exportName: 'ZButton',
        source: 'src/button.tsx',
        props: {
          'button-size': {
            type: 'string',
          },
        },
        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      wcModuleId: 'zeus:wc:z-button',
      mode: 'event-bridge',
    })

    expect(code).toContain('const nextValue = props[name]')
    expect(code).not.toContain('el.button-size')
    expect(code).not.toContain('props.button-size')
  })

  it('handles component with named slots in event-bridge mode', () => {
    const code = generateVueWrapper({
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
      wcModuleId: 'zeus:wc:z-card',
      mode: 'event-bridge',
    })

    expect(code).toContain('NAMED_SLOTS')
    expect(code).toContain('"header"')
    expect(code).toContain('"footer"')
    expect(code).toContain('slot: name')
    expect(code).toContain('slots[name]')
    expect(code).toContain('display: contents')
  })

  it('generates minimal Vue wrapper by default', () => {
    const code = generateVueWrapper({
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
          disabled: {
            type: 'boolean',
          },
        },
        events: {
          press: {},
        },
        slots: {
          default: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      wcModuleId: 'zeus:wc:z-button',
    })

    // minimal wrapper imports wcModuleId to bootstrap Proxy Elements
    expect(code).toContain('import "zeus:wc:z-button"')
    expect(code).not.toContain('el.variant = props.variant')
    expect(code).not.toContain('watch(')
    expect(code).not.toContain('onMounted(')
    expect(code).not.toContain('addEventListener')
    expect(code).toContain('export const ZButton = defineComponent')
    expect(code).toContain('inheritAttrs: false')
    expect(code).toContain('slots.default')
    expect(code).toContain('h("z-button", attrs, children)')
    expect(code).not.toContain('cloneVNode')
    expect(code).not.toContain('NAMED_SLOTS')
    expect(code).not.toContain('pushAll')
    expect(code).not.toContain('...attrs')
  })

  it('handles component with named slots in minimal Vue mode', () => {
    const code = generateVueWrapper({
      component: {
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
      wcModuleId: 'zeus:wc:z-card',
    })

    expect(code).toContain('NAMED_SLOTS')
    expect(code).toContain('"header"')
    expect(code).toContain('"footer"')
    expect(code).toContain('cloneVNode')
    expect(code).toContain('slot: name')
    expect(code).toContain('slots[name]')
    expect(code).toContain('display: contents')
    expect(code).not.toContain('watch(')
    expect(code).not.toContain('onMounted(')
  })

  it('emits component name as name option', () => {
    const code = generateVueWrapper({
      component: {
        tag: 'z-test',
        name: 'MyTestComponent',
        exportName: 'MyTestComponent',
        source: 'src/test.tsx',
        props: {},
        events: {},
        slots: {
          default: {},
        },
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },
      wcModuleId: 'zeus:wc:z-test',
    })

    expect(code).toContain('name: "MyTestComponent"')
    expect(code).toContain('export const MyTestComponent = defineComponent')
  })

  it('does not copy Web Component defaults into Vue wrapper props', () => {
    const code = generateVueWrapper({
      component: {
        tag: 'z-button',
        name: 'ZButton',
        exportName: 'ZButton',
        source: 'src/button.tsx',

        props: {
          config: {
            type: 'object',
            default: {
              size: 'md',
            },
          },
          variant: {
            type: 'string',
            default: 'primary',
          },
        },

        events: {},
        slots: {},
        hostAttributes: [],
        cssParts: [],
        cssVars: {},
      },

      wcModuleId: 'zeus:wc:z-button',
      mode: 'event-bridge',
    })

    expect(code).not.toContain('default:')
    expect(code).toContain('required: false')
  })
})
