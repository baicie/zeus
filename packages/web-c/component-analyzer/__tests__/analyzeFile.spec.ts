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
      cssVars: ['--z-button-bg'],
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
      default: {},
      footer: {},
      header: {},
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
