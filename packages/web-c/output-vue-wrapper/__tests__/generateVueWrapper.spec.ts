import { describe, expect, it } from 'vitest'

import { generateVueWrapper } from '../src/generateVueWrapper'

describe('generateVueWrapper', () => {
  it('generates Vue wrapper code', () => {
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
        cssVars: [],
      },
      wcModuleId: 'zeus:wc:z-button',
    })

    expect(code).toContain('import "zeus:wc:z-button"')
    expect(code).toContain('export const ZButton = defineComponent')
    expect(code).toContain('name: "ZButton"')
    expect(code).toContain('props: {')
    expect(code).toContain('emits: EVENT_NAMES')
    expect(code).toContain('const elRef = ref(null)')

    // Vue unconditionally syncs props
    expect(code).toContain('el.variant = props.variant')
    expect(code).toContain('el.disabled = props.disabled')

    expect(code).toContain('for (const eventName of EVENT_NAMES)')
    expect(code).toContain('emit(eventName, event)')
    expect(code).toContain('el.addEventListener(eventName, handler)')
    expect(code).toContain('removeEventListener(eventName, handler)')

    expect(code).toContain(
      'watch(() => [props.variant, props.disabled], syncProps)',
    )

    expect(code).toContain('const cleanups = []')
    expect(code).toContain('onBeforeUnmount')
    expect(code).toContain('for (const cleanup of cleanups)')

    expect(code).toContain('slots.default')
    expect(code).toContain('h(')
    expect(code).toContain('withSlot')

    expect(code).toContain('PROP_KEYS')
    expect(code).toContain('EVENT_NAMES')
    expect(code).toContain('NAMED_SLOTS')
  })

  it('handles component with named slots', () => {
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
        cssVars: [],
      },
      wcModuleId: 'zeus:wc:z-card',
    })

    expect(code).toContain('NAMED_SLOTS')
    expect(code).toContain('"header"')
    expect(code).toContain('"footer"')
    expect(code).toContain('slot: name')
    expect(code).toContain('slots[name]')
    expect(code).toContain('display: contents')
  })

  it('generates guard comment when no props exist', () => {
    const code = generateVueWrapper({
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
      wcModuleId: 'zeus:wc:z-skeleton',
    })

    expect(code).toContain('// no props to sync')
    expect(code).toContain('// no reactive props')
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
        cssVars: [],
      },
      wcModuleId: 'zeus:wc:z-test',
    })

    expect(code).toContain('name: "MyTestComponent"')
    expect(code).toContain('export const MyTestComponent = defineComponent')
  })
})
