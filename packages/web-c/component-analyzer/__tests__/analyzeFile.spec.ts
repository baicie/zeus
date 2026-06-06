import { describe, expect, it } from 'vitest'

import { analyzeFile } from '../src/analyzeFile'

describe('analyzeFile', () => {
  it('extracts component manifest from defineElement', () => {
    const code = `
      import { defineElement, Host, Slot } from '@zeus-js/zeus'

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
            cssVars: ['--z-button-bg'],
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
                onClick={event => emit('press', { nativeEvent: event })}
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

  it('extracts emit events from setup', () => {
    const code = `
      import { defineElement } from '@zeus-js/zeus'

      export const ZToggle = defineElement(
        'z-toggle',
        {},
        (props, { emit }) => {
          const handleClick = () => {
            emit('change', { value: true })
            emit('toggle', { active: true })
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
})
