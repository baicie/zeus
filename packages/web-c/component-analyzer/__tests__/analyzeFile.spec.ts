import { describe, expect, it } from 'vitest'

import { analyzeFile } from '../src/analyzeFile'

describe('analyzeFile', () => {
  it('extracts component manifest from defineElement', () => {
    const code = `
      import { defineElement, event, Host, Slot } from '@zeus-js/zeus'

      export interface ButtonProps {
        /**
         * Button variant.
         */
        variant?: 'default' | 'outline' | 'ghost'

        /**
         * Disabled state.
         */
        disabled?: boolean
      }

      export const ZButton = defineElement<ButtonProps>(
        'z-button',
        {
          shadow: false,
          emits: {
            press: event<{ nativeEvent: MouseEvent }>(),
          },
          props: {
            variant: {
              type: String,
              default: 'default',
              reflect: true,
            },
            disabled: {
              type: Boolean,
              default: false,
              reflect: true,
            },
          },
          meta: {
            description: 'Headless button primitive',
            events: {
              press: {
                detail: {
                  nativeEvent: 'MouseEvent',
                },
              },
            },
            slots: {
              default: {
                description: 'Button content',
              },
            },
            cssVars: {
              '--z-button-bg': {},
            },
          },
        },
        (props, { emit }) => {
          return (
            <Host
              data-slot="button"
              data-variant={props.variant}
              data-disabled={props.disabled ? '' : undefined}
            >
              <button
                part="root"
                disabled={props.disabled}
                onClick={event => emit.press({ nativeEvent: event })}
              >
                <Slot />
              </button>
            </Host>
          )
        },
      )
    `

    const result = analyzeFile({
      file: 'src/button.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components).toHaveLength(1)

    expect(result.components[0]).toMatchObject({
      tag: 'z-button',
      name: 'ZButton',
      exportName: 'ZButton',
      source: 'src/button.tsx',
      description: 'Headless button primitive',
      props: {
        variant: {
          type: 'string',
          values: ['default', 'outline', 'ghost'],
          default: 'default',
          reflect: true,
          required: false,
          description: 'Button variant.',
        },
        disabled: {
          type: 'boolean',
          default: false,
          reflect: true,
          required: false,
          description: 'Disabled state.',
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
        default: {
          description: 'Button content',
        },
      },
      hostAttributes: ['data-disabled', 'data-slot', 'data-variant'],
      cssParts: ['root'],
      cssVars: {
        '--z-button-bg': {
          name: '--z-button-bg',
        },
      },
    })
  })

  it('extracts named slots', () => {
    const code = `
      import { defineElement, Slot } from '@zeus-js/zeus'

      export const ZCard = defineElement(
        'z-card',
        {},
        () => {
          return (
            <section>
              <Slot name="header" />
              <Slot />
              <Slot name="footer" />
            </section>
          )
        },
      )
    `

    const result = analyzeFile({
      file: 'src/card.tsx',
      code,
    })

    expect(result.components[0].slots).toEqual({
      default: { name: 'default' },
      footer: { name: 'footer' },
      header: { name: 'header' },
    })
  })

  it('extracts primitive protocol metadata', () => {
    const code = `
      import { Host, defineElement, event, prop } from '@zeus-js/zeus'

      export const ZInput = defineElement(
        'z-input',
        {
          shadow: false,
          props: {
            value: String,
            type: prop(['text', 'password'], {
              default: 'text',
              reflect: true,
            }),
            formatter: Function,
          },
          emits: {
            valueChange: event<{ value: string }>(),
          },
        },
        (_props, { emit, expose }) => {
          expose({
            focus() {},
          })

          return (
            <Host>
              <slot name="prefix" />
              <input part="control" onInput={() => emit.valueChange({ value: '' })} />
            </Host>
          )
        },
      )
    `

    const result = analyzeFile({
      file: 'src/input.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0]).toMatchObject({
      props: {
        type: {
          type: 'string',
          values: ['text', 'password'],
          default: 'text',
          reflect: true,
        },
        formatter: {
          type: 'function',
        },
      },
      events: {
        valueChange: {
          key: 'valueChange',
          name: 'value-change',
          reactName: 'onValueChange',
          detail: {
            value: 'string',
          },
          bubbles: true,
          composed: true,
          cancelable: false,
        },
      },
      methods: {
        focus: {
          name: 'focus',
        },
      },
      slots: {
        prefix: {
          name: 'prefix',
        },
      },
      cssParts: ['control'],
      meta: {
        shadow: false,
      },
    })
  })

  it('extracts constructor prop shorthand metadata', () => {
    const code = `
      import { defineElement, prop } from '@zeus-js/zeus'

      export const ZInput = defineElement(
        'z-input',
        {
          props: {
            disabled: prop(Boolean),
            required: prop(Boolean, {
              reflect: false,
            }),
          },
        },
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/input.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0]).toMatchObject({
      props: {
        disabled: {
          type: 'boolean',
          default: false,
          reflect: true,
        },
        required: {
          type: 'boolean',
          default: false,
          reflect: false,
        },
      },
    })
  })

  it('extracts form association and prop serialization metadata', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      export const ZInput = defineElement(
        'z-input',
        {
          shadow: false,
          formAssociated: true,
          props: {
            value: {
              type: String,
              reflect: true,
              serialize: value => value.trim(),
              deserialize: value => value ?? '',
            },
            tokens: {
              type: Array,
              attr: 'tokens',
              serialize: value => value.join('|'),
              deserialize: value => value ? value.split('|') : [],
            },
          },
        },
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/input.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0]).toMatchObject({
      props: {
        value: {
          type: 'string',
          reflect: true,
          serialize: true,
          deserialize: true,
        },
        tokens: {
          type: 'array',
          attr: 'tokens',
          serialize: true,
          deserialize: true,
        },
      },
      meta: {
        shadow: false,
        formAssociated: true,
      },
    })
  })

  it('extracts model mappings and exposed method signatures', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      export const ZInput = defineElement<{ value?: string }>(
        'z-input',
        {
          props: {
            value: String,
          },
          models: [
            {
              prop: 'value',
              event: 'value-change',
              eventPath: 'detail.value',
            },
          ],
        },
        (_props, { expose }) => {
          expose({
            async setValue(value: string, commit = true): Promise<boolean> {
              return commit && value.length > 0
            },
            request(...reasons: string[]): Promise<number> {
              return Promise.resolve(reasons.length)
            },
            focus(): void {},
          })

          return null
        },
      )
    `

    const result = analyzeFile({
      file: 'src/input.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].models).toEqual([
      {
        prop: 'value',
        event: 'value-change',
        eventPath: 'detail.value',
      },
    ])
    expect(result.components[0].methods).toEqual({
      focus: {
        name: 'focus',
        parameters: [],
        returns: 'void',
        async: false,
      },
      setValue: {
        name: 'setValue',
        parameters: [
          {
            name: 'value',
            type: 'string',
            optional: false,
          },
          {
            name: 'commit',
            type: 'boolean',
            optional: true,
          },
        ],
        returns: 'boolean',
        async: true,
      },
      request: {
        name: 'request',
        parameters: [
          {
            name: 'reasons',
            type: 'string[]',
            optional: false,
            rest: true,
          },
        ],
        returns: 'Promise<number>',
        async: false,
      },
    })
  })

  it('infers model mappings from prop change events', () => {
    const code = `
      import { defineElement, event } from '@zeus-js/zeus'

      export const ZInput = defineElement<{ value?: string }>(
        'z-input',
        {
          props: {
            value: String,
            placeholder: String,
          },
          emits: {
            valueChange: event<{ value: string; nativeEvent: Event }>(),
            focusChange: event<{ focused: boolean; nativeEvent: FocusEvent }>(),
          },
        },
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/input.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].models).toEqual([
      {
        prop: 'value',
        event: 'value-change',
        eventPath: 'detail.value',
      },
    ])
  })

  it('extracts setup metadata from local setup references', () => {
    const code = `
      import { defineElement, event, Host, Slot } from '@zeus-js/zeus'

      type InputProps = {
        value?: string
      }

      function setup(_props: InputProps, ctx) {
        ctx.expose({
          focus(): void {},
        })

        return (
          <Host data-slot="input">
            <label part="root">
              <Slot name="prefix" />
              <input
                part="control"
                onInput={() => ctx.emit.valueChange({ value: '' })}
              />
            </label>
          </Host>
        )
      }

      export const ZInput = defineElement<InputProps>(
        'z-input',
        {
          props: {
            value: String,
          },
          emits: {
            valueChange: event<{ value: string }>(),
          },
        },
        setup,
      )
    `

    const result = analyzeFile({
      file: 'src/input.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0]).toMatchObject({
      models: [
        {
          prop: 'value',
          event: 'value-change',
          eventPath: 'detail.value',
        },
      ],
      methods: {
        focus: {
          name: 'focus',
        },
      },
      slots: {
        prefix: {
          name: 'prefix',
        },
      },
      hostAttributes: ['data-slot'],
      cssParts: ['control', 'root'],
    })
  })

  it('allows explicit empty models to disable model inference', () => {
    const code = `
      import { defineElement, event } from '@zeus-js/zeus'

      export const ZInput = defineElement<{ value?: string }>(
        'z-input',
        {
          props: {
            value: String,
          },
          emits: {
            valueChange: event<{ value: string }>(),
          },
          models: [],
        },
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/input.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].models).toBeUndefined()
  })

  it('keeps setup-inferred event detail for declared emits', () => {
    const code = `
      import { defineElement, event } from '@zeus-js/zeus'

      export const ZSwitch = defineElement(
        'z-switch',
        {
          emits: {
            checkedChange: event<{ checked: boolean }>('checked-change'),
          },
        },
        (_props, { emit }) => {
          emit.checkedChange({ checked: true })
          return <button />
        },
      )
    `

    const result = analyzeFile({
      file: 'src/switch.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].events.checkedChange).toMatchObject({
      key: 'checkedChange',
      name: 'checked-change',
      reactName: 'onCheckedChange',
      detail: {
        checked: 'boolean',
      },
    })
  })

  it('ignores setup events that are not declared in emits', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      export const ZSwitch = defineElement(
        'z-switch',
        {},
        (_props, { emit }) => {
          emit.checkedChange({ checked: true })
          return <button />
        },
      )
    `

    const result = analyzeFile({
      file: 'src/switch.tsx',
      code,
    })

    expect(result.components[0].events).toEqual({})
  })

  it('extracts detail from event type parameters', () => {
    const code = `
      import { defineElement, event } from '@zeus-js/zeus'

      export const ZSwitch = defineElement(
        'z-switch',
        {
          emits: {
            checkedChange: event<{ checked: boolean }>('checked-change'),
          },
        },
        () => <button />,
      )
    `

    const result = analyzeFile({
      file: 'src/switch.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].events.checkedChange).toMatchObject({
      key: 'checkedChange',
      name: 'checked-change',
      reactName: 'onCheckedChange',
      detail: {
        checked: 'boolean',
      },
    })
  })

  it('preserves portable types and erases source-bound references', () => {
    const code = `
      import { defineElement, event } from '@zeus-js/zeus'

      interface GridRow {
        id: string
      }

      export const ZGrid = defineElement(
        'z-grid',
        {
          emits: {
            rowAction: event<{
              nativeEvent: MouseEvent
              keyboardEvent: KeyboardEvent
              createdAt: Date
              rows: Array
              readonlyRows: ReadonlyArray
              row: GridRow
            }>(),
          },
        },
        (_props, { expose }) => {
          expose({
            handleEvent(event: KeyboardEvent): MouseEvent {
              return event as unknown as MouseEvent
            },
            setRows(rows: GridRow[]): void {
              void rows
            },
          })

          return null
        },
      )
    `

    const result = analyzeFile({
      file: 'src/grid.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].events.rowAction.detail).toEqual({
      nativeEvent: 'MouseEvent',
      keyboardEvent: 'KeyboardEvent',
      createdAt: 'Date',
      rows: 'array',
      readonlyRows: 'array',
      row: 'unknown',
    })
    expect(result.components[0].methods).toMatchObject({
      handleEvent: {
        parameters: [
          {
            name: 'event',
            type: 'KeyboardEvent',
          },
        ],
        returns: 'MouseEvent',
      },
      setRows: {
        parameters: [
          {
            name: 'rows',
            type: 'unknown[]',
          },
        ],
        returns: 'void',
      },
    })
  })

  it.each([
    [
      'an unresolved intersection constituent',
      'type PublicProps = PackageProps & LocalProps',
    ],
    [
      'an unresolved interface heritage',
      'interface PublicProps extends PackageProps, LocalProps {}',
    ],
    [
      'a qualified interface heritage',
      'interface PublicProps extends LocalProps, Package.Props {}',
    ],
    [
      'a props interface method signature',
      'interface PublicProps { localOnly?: string; onCommit(): void }',
    ],
    [
      'a props interface index signature',
      'interface PublicProps { localOnly?: string; [key: string]: unknown }',
    ],
    [
      'a props type literal call signature',
      'type PublicProps = { localOnly?: string; (value: string): void }',
    ],
  ])('fails closed for %s', (_case, declaration) => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'
      import type { PackageProps } from 'package'
      import type * as Package from 'package'

      interface LocalProps {
        localOnly?: string
      }

      ${declaration}

      export const ZCard = defineElement<PublicProps>(
        'z-card',
        {
          props: {
            runtimeOnly: String,
          },
        },
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/card.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([
      {
        level: 'warning',
        file: 'src/card.tsx',
        message: 'Cannot resolve local props type "PublicProps".',
      },
    ])
    expect(Object.keys(result.components[0].props)).toEqual(['runtimeOnly'])
    expect(result.components[0].props.runtimeOnly).toMatchObject({
      type: 'string',
    })
  })

  it('warns when props type cannot be resolved locally', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'
      import type { ButtonProps } from './types'

      export const ZButton = defineElement<ButtonProps>(
        'z-button',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/button.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([
      {
        level: 'warning',
        file: 'src/button.tsx',
        message: 'Cannot resolve local props type "ButtonProps".',
      },
    ])
  })

  it('reports an error when runtime props are not statically analyzable', () => {
    const result = analyzeFile({
      file: 'button.tsx',
      code: `
        import { defineElement } from '@zeus-js/runtime-dom'

        const buttonProps = {
          disabled: Boolean,
        }

        export const ZButton = defineElement(
          'z-button',
          {
            props: buttonProps,
          },
          () => null,
        )
      `,
    })

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining(
          'props must be an inline object literal',
        ),
      }),
    )
  })

  it('reports an error when defineElement options contain spreads', () => {
    const result = analyzeFile({
      file: 'button.tsx',
      code: `
        import { defineElement } from '@zeus-js/runtime-dom'

        const baseOptions = {
          props: {
            disabled: Boolean,
          },
        }

        export const ZButton = defineElement(
          'z-button',
          {
            ...baseOptions,
          },
          () => null,
        )
      `,
    })

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining('options cannot contain spreads'),
      }),
    )
  })

  it('reports an error when runtime props contain spreads', () => {
    const result = analyzeFile({
      file: 'button.tsx',
      code: `
        import { defineElement } from '@zeus-js/runtime-dom'

        const commonProps = {
          disabled: Boolean,
        }

        export const ZButton = defineElement(
          'z-button',
          {
            props: {
              ...commonProps,
              size: String,
            },
          },
          () => null,
        )
      `,
    })

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        level: 'warning',
        message: expect.stringContaining('cannot contain spreads'),
      }),
    )
  })

  it('ignores non-exported defineElement by default', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      const Internal = defineElement('z-internal', {}, () => null)
    `

    const result = analyzeFile({
      file: 'src/internal.tsx',
      code,
    })

    expect(result.components).toEqual([])
  })

  it('extracts cssParts from part attribute', () => {
    const code = `
      import { defineElement, Host, Slot } from '@zeus-js/zeus'

      export const ZCard = defineElement(
        'z-card',
        {},
        () => (
          <Host>
            <div part="header">
              <Slot name="header" />
            </div>
            <div part="content">
              <Slot />
            </div>
            <footer part="footer">
              <Slot name="footer" />
            </footer>
          </Host>
        ),
      )
    `

    const result = analyzeFile({
      file: 'src/card.tsx',
      code,
    })

    expect(result.components[0].cssParts).toEqual([
      'content',
      'footer',
      'header',
    ])
  })

  it('extracts type alias props', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      export type IconProps = {
        /** Icon name */
        name: 'check' | 'close' | 'info'
        /** Icon size */
        size?: number
      }

      export const ZIcon = defineElement<IconProps>(
        'z-icon',
        {
          props: {
            name: { type: String },
            size: { type: Number, default: 16 },
          },
        },
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/icon.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].props).toMatchObject({
      name: {
        type: 'string',
        values: ['check', 'close', 'info'],
        required: true,
        description: 'Icon name',
      },
      size: {
        type: 'number',
        default: 16,
        required: false,
        description: 'Icon size',
      },
    })
  })

  it('extracts declared emit details from setup', () => {
    const code = `
      import { defineElement, event } from '@zeus-js/zeus'

      export const ZToggle = defineElement(
        'z-toggle',
        {
          emits: {
            change: event<{ value: boolean }>(),
            toggle: event<{ active: boolean }>(),
          },
        },
        (props, { emit }) => {
          const handleClick = () => {
            emit.change({ value: true })
            emit.toggle({ active: true })
          }
          return <button onClick={handleClick} />
        },
      )
    `

    const result = analyzeFile({
      file: 'src/toggle.tsx',
      code,
    })

    expect(result.components[0].events).toMatchObject({
      change: { detail: { value: 'boolean' } },
      toggle: { detail: { active: 'boolean' } },
    })
  })

  it('does not leak source-bound names into consumer declarations', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'
      import type { Event as ImportedEvent } from 'external-events'
      import Blob = require('external-blob')

      class Event {}
      enum Promise { pending }
      namespace Date {}

      interface BoundProps {
        imported?: ImportedEvent
        event?: Event
        promise?: Promise
        date?: Date
        blob?: Blob
        native?: MouseEvent
      }

      export const ZBound = defineElement<BoundProps>(
        'z-bound',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/bound.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].props).toMatchObject({
      imported: { type: 'unknown' },
      event: { type: 'unknown' },
      promise: { type: 'unknown' },
      date: { type: 'unknown' },
      blob: { type: 'unknown' },
      native: {
        type: 'unknown',
        declaration: { type: 'MouseEvent' },
      },
    })
  })

  it('expands a local Date alias for later PropType renaming', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      type Date = { iso: string }
      interface DateProps {
        createdAt?: Date
      }

      export const ZDate = defineElement<DateProps>(
        'z-date',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/date.tsx',
      code,
    })

    expect(result.diagnostics).toEqual([])
    expect(result.components[0].props.createdAt).toMatchObject({
      type: 'unknown',
      declaration: {
        reference: 'Date',
        type: '{ iso: string }',
      },
    })
  })

  it.each([
    [
      'an interface computed property',
      `interface PublicProps { [propName]: string }`,
    ],
    [
      'a type literal computed property',
      `type PublicProps = { [propName]: string }`,
    ],
    [
      'a nested type literal computed property',
      `interface PublicProps { config?: { [propName]: string } }`,
    ],
  ])('fails closed for %s', (_description, declaration) => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'
      const propName = 'value'
      ${declaration}

      export const ZComputed = defineElement<PublicProps>(
        'z-computed',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/computed.tsx',
      code,
    })

    if (_description === 'a nested type literal computed property') {
      expect(result.diagnostics).toEqual([])
      expect(result.components[0].props.config).toMatchObject({
        type: 'object',
      })
      expect(result.components[0].props.config.declaration).toBeUndefined()
    } else {
      expect(result.diagnostics).toEqual([
        {
          level: 'warning',
          file: 'src/computed.tsx',
          message: 'Cannot resolve local props type "PublicProps".',
        },
      ])
      expect(result.components[0].props).toEqual({})
    }
  })

  it('fails closed for unsupported emit details and generic exposed methods', () => {
    const code = `
      import { defineElement, event } from '@zeus-js/zeus'

      class Event {}
      type Promise = { local: true }
      type Date = { iso: string }

      export const ZEmit = defineElement(
        'z-emit',
        {
          emits: {
            typed: event<{ value: string; [key: string]: unknown }>(),
            runtime: event(),
            computed: event(),
          },
        },
        (_props, { emit, expose }) => {
          expose({
            identity<T>(value: T): T {
              return value
            },
            local(value: Event): Promise {
              return value as unknown as Promise
            },
            dated(value: Date): Date {
              return value
            },
          })

          emit.runtime({ value: '', ...{ unsafe: true } })
          emit.computed({ [String('value')]: true })
          return null
        },
      )
    `

    const result = analyzeFile({
      file: 'src/emit.tsx',
      code,
    })
    const component = result.components[0]

    expect(result.diagnostics).toEqual([])
    expect(component.events.typed.detail).toBeUndefined()
    expect(component.events.runtime.detail).toBeUndefined()
    expect(component.events.computed.detail).toBeUndefined()
    expect(component.methods).toMatchObject({
      identity: {
        parameters: [{ type: 'unknown' }],
        returns: 'unknown',
      },
      local: {
        parameters: [{ type: 'unknown' }],
        returns: 'unknown',
      },
      dated: {
        parameters: [{ type: 'unknown' }],
        returns: 'unknown',
      },
    })
  })

  it('fails closed for generic roots, generic function types, and declaration merges', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      interface GenericProps<T> {
        value: T
      }
      type GenericCallback = <T>(value: T) => T
      type CallbackProps = { callback?: GenericCallback }
      interface MergedProps { first: string }
      interface MergedProps { second: number }

      export const ZGeneric = defineElement<GenericProps<string>>(
        'z-generic',
        {},
        () => null,
      )
      export const ZMerged = defineElement<MergedProps>(
        'z-merged',
        {},
        () => null,
      )
      export const ZCallback = defineElement<CallbackProps>(
        'z-callback',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/generic.tsx',
      code,
    })

    expect(result.components).toHaveLength(3)
    expect(result.diagnostics).toEqual([
      {
        level: 'warning',
        file: 'src/generic.tsx',
        message: 'Cannot resolve local props type "GenericProps".',
      },
      {
        level: 'warning',
        file: 'src/generic.tsx',
        message: 'Cannot resolve local props type "MergedProps".',
      },
    ])
    expect(result.components[2].props.callback).toMatchObject({
      type: 'unknown',
    })
    expect(result.components[2].props.callback.declaration).toBeUndefined()
  })

  it('does not leak setup-local types or nested function generics', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      export const ZScoped = defineElement(
        'z-scoped',
        {},
        (_props, { expose }) => {
          type Event = { localEvent: true }
          type Promise = { localPromise: true }

          expose({
            leak(value: Event): Promise {
              return value as unknown as Promise
            },
          })

          function nested<T>() {
            expose({
              identity(value: T): T {
                return value
              },
            })
          }
          void nested
          return null
        },
      )
    `

    const result = analyzeFile({
      file: 'src/scoped.tsx',
      code,
    })

    expect(result.components[0].methods).toMatchObject({
      leak: {
        parameters: [{ type: 'unknown' }],
        returns: 'unknown',
      },
      identity: {
        parameters: [{ type: 'unknown' }],
        returns: 'unknown',
      },
    })
  })

  it('fails closed when intersection branches declare the same prop', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      type PublicProps =
        { config: { a: string } } &
        { config: { b: number } }

      export const ZIntersection = defineElement<PublicProps>(
        'z-intersection',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/intersection.tsx',
      code,
    })

    expect(result.components[0].props).toEqual({})
    expect(result.diagnostics).toEqual([
      {
        level: 'warning',
        file: 'src/intersection.tsx',
        message: 'Cannot resolve local props type "PublicProps".',
      },
    ])
  })

  it('bounds recursive local type expansion', () => {
    const aliases = Array.from(
      { length: 18 },
      (_, index) =>
        `type Node${index + 1} = { left: Node${index}; right: Node${index} }`,
    ).join('\n')
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      type Node0 = { value: string }
      ${aliases}
      interface PublicProps { tree?: Node18 }

      export const ZBounded = defineElement<PublicProps>(
        'z-bounded',
        {},
        () => null,
      )
    `

    const result = analyzeFile({
      file: 'src/bounded.tsx',
      code,
    })

    expect(result.components[0].props.tree).toMatchObject({ type: 'unknown' })
    expect(result.components[0].props.tree.declaration).toBeUndefined()
  })
})
