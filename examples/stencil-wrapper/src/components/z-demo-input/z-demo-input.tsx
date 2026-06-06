import {
  Component,
  Element,
  Event,
  EventEmitter,
  h,
  Host,
  Method,
  Prop,
  State,
  Watch,
} from '@stencil/core'

export interface DemoInputMeta {
  description?: string
  tone?: 'neutral' | 'danger'
}

/**
 * @slot prefix - Content rendered before the native input.
 * @slot suffix - Content rendered after the native input.
 * @slot message - Helper or validation message below the control.
 * @part root - The label wrapping the input and side slots.
 * @part prefix - Prefix slot wrapper.
 * @part control - The native input element.
 * @part suffix - Suffix slot wrapper.
 * @part message - Message slot wrapper.
 */
@Component({
  tag: 'z-demo-input',
  styleUrl: 'z-demo-input.css',
  shadow: true,
})
export class ZDemoInput {
  @Element() host!: HTMLZDemoInputElement

  /** Whether the input is disabled. Reflected as a boolean attribute. */
  @Prop({ reflect: true }) disabled = false

  /** Optional formatter run before value-change is emitted. Function props are property-only. */
  @Prop() formatter?: (value: string) => string

  /** Whether the current value is invalid. Reflected as a boolean attribute. */
  @Prop({ reflect: true }) invalid = false

  /** Maximum native input length. Number props deserialize from HTML attributes. */
  @Prop({ attribute: 'max-length' }) maxLength?: number

  /** Additional structured metadata. Object props must be assigned as properties. */
  @Prop() meta?: DemoInputMeta

  /** Native input placeholder text. */
  @Prop() placeholder?: string

  /** Current value. Mutable because user input updates it internally. */
  @Prop({ mutable: true, reflect: true }) value = ''

  /** Internal render state. Not exposed to framework wrappers. */
  @State() focused = false

  /** Fires when user input changes the value. */
  @Event({ eventName: 'value-change' })
  valueChange!: EventEmitter<{ value: string; nativeEvent: Event }>

  /** Fires when the inner input gains or loses focus. */
  @Event({ eventName: 'focus-change' })
  focusChange!: EventEmitter<{ focused: boolean; nativeEvent: FocusEvent }>

  private control?: HTMLInputElement

  private handleInput = (nativeEvent: Event) => {
    const target = nativeEvent.target as HTMLInputElement
    this.value =
      typeof this.formatter === 'function'
        ? this.formatter(target.value)
        : target.value
    target.value = this.value
    this.valueChange.emit({ value: this.value, nativeEvent })
  }

  private handleFocus = (nativeEvent: FocusEvent) => {
    this.focused = true
    this.focusChange.emit({ focused: true, nativeEvent })
  }

  private handleBlur = (nativeEvent: FocusEvent) => {
    this.focused = false
    this.focusChange.emit({ focused: false, nativeEvent })
  }

  @Watch('invalid')
  protected invalidChanged(value: boolean) {
    this.host.toggleAttribute('data-watch-invalid', value)
  }

  /** Public method exposed on the custom element instance. */
  @Method()
  async focusControl() {
    this.control?.focus()
  }

  /** Public method exposed on the custom element instance. */
  @Method()
  async selectControl() {
    this.control?.select()
  }

  /** Public method exposed on the custom element instance. */
  @Method()
  async setValue(value: string) {
    this.value = value
  }

  render() {
    return (
      <Host
        data-focused={this.focused ? 'true' : undefined}
        data-tone={this.meta?.tone}
      >
        <label part="root">
          <span part="prefix">
            <slot name="prefix" />
          </span>
          <input
            ref={el => {
              this.control = el
            }}
            part="control"
            value={this.value}
            placeholder={this.placeholder}
            disabled={this.disabled}
            maxLength={this.maxLength}
            aria-invalid={this.invalid ? 'true' : undefined}
            onInput={this.handleInput}
            onFocus={this.handleFocus}
            onBlur={this.handleBlur}
          />
          <span part="suffix">
            <slot name="suffix" />
          </span>
        </label>
        <div part="message">
          <slot name="message">{this.meta?.description}</slot>
        </div>
      </Host>
    )
  }
}
