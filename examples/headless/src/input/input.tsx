import { defineElement, event, Host, prop, Slot } from '@zeus-js/zeus'

import type { DefineElementContext, EventDefinition } from '@zeus-js/zeus'

export interface InputProps {
  value?: string
  placeholder?: string
  type?: 'text' | 'email' | 'password' | 'search'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  required?: boolean
  invalid?: boolean
  formatter?: (value: string) => string
}

type InputEmits = {
  valueChange: EventDefinition<{ value: string; nativeEvent: Event }>
  focusChange: EventDefinition<{ focused: boolean; nativeEvent: FocusEvent }>
}

type InputHost = HTMLElement & {
  value?: string
  focus(): void
  blur(): void
  select(): void
}

function setup(
  props: InputProps,
  ctx: DefineElementContext<InputHost, InputEmits>,
) {
  let control!: HTMLInputElement

  const getFormattedValue = (value: string) =>
    typeof props.formatter === 'function' ? props.formatter(value) : value

  const handleInput = (nativeEvent: Event) => {
    const value = getFormattedValue(control.value)
    control.value = value
    ctx.host.value = value
    ctx.emit.valueChange({ value, nativeEvent })
  }

  const handleFocus = (nativeEvent: FocusEvent) => {
    ctx.emit.focusChange({ focused: true, nativeEvent })
  }

  const handleBlur = (nativeEvent: FocusEvent) => {
    ctx.emit.focusChange({ focused: false, nativeEvent })
  }

  ctx.expose({
    focus() {
      control.focus()
    },
    blur() {
      control.blur()
    },
    select() {
      control.select()
    },
  })

  return (
    <Host
      data-slot="input"
      data-size={() => props.size}
      data-disabled={() => (props.disabled ? '' : undefined)}
      data-invalid={() => (props.invalid ? '' : undefined)}
    >
      <label part="root">
        <span part="prefix" data-slot="input-prefix">
          <Slot name="prefix" />
        </span>

        <input
          ref={(el: HTMLInputElement | null) => {
            if (el) control = el
          }}
          part="control"
          prop:type={() => props.type ?? 'text'}
          prop:value={() => props.value ?? ''}
          placeholder={() => props.placeholder}
          disabled={() => Boolean(props.disabled)}
          required={() => Boolean(props.required)}
          aria-invalid={() => (props.invalid ? 'true' : undefined)}
          onInput={handleInput}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />

        <span part="suffix" data-slot="input-suffix">
          <Slot name="suffix" />
        </span>
      </label>

      <div part="message" data-slot="input-message">
        <Slot name="message" />
      </div>
    </Host>
  )
}

export const ZInput = defineElement<InputProps, InputHost, InputEmits>(
  'z-input',
  {
    shadow: false,
    props: {
      value: {
        type: String,
        default: '',
        reflect: true,
      },
      placeholder: String,
      type: prop(['text', 'email', 'password', 'search'], {
        default: 'text',
        reflect: true,
      }),
      size: prop(['sm', 'md', 'lg'], {
        default: 'md',
        reflect: true,
      }),
      disabled: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      required: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      invalid: {
        type: Boolean,
        default: false,
        reflect: true,
      },
      formatter: Function,
    },
    emits: {
      valueChange: event<{ value: string; nativeEvent: Event }>(),
      focusChange: event<{ focused: boolean; nativeEvent: FocusEvent }>(),
    },
    cssVars: {
      '--z-input-border': {
        description: 'Input border color.',
      },
      '--z-input-ring': {
        description: 'Input focus ring color.',
      },
    },
    meta: {
      description: 'Headless input primitive with slots, events and methods.',
      slots: {
        prefix: {
          description: 'Content rendered before the native input.',
        },
        suffix: {
          description: 'Content rendered after the native input.',
        },
        message: {
          description: 'Validation or helper message.',
        },
      },
      cssParts: ['root', 'prefix', 'control', 'suffix', 'message'],
    },
  },
  setup,
)
