import { Component, Event, EventEmitter, h, Host, Prop } from '@stencil/core'

@Component({
  tag: 'z-demo-input',
  styleUrl: 'z-demo-input.css',
  shadow: true,
})
export class ZDemoInput {
  @Prop({ reflect: true }) disabled = false
  @Prop({ reflect: true }) invalid = false
  @Prop() placeholder?: string
  @Prop({ mutable: true, reflect: true }) value = ''

  @Event({ eventName: 'value-change' })
  valueChange!: EventEmitter<{ value: string; nativeEvent: Event }>

  @Event({ eventName: 'focus-change' })
  focusChange!: EventEmitter<{ focused: boolean; nativeEvent: FocusEvent }>

  private handleInput = (nativeEvent: Event) => {
    const target = nativeEvent.target as HTMLInputElement
    this.value = target.value
    this.valueChange.emit({ value: this.value, nativeEvent })
  }

  private handleFocus = (nativeEvent: FocusEvent) => {
    this.focusChange.emit({ focused: true, nativeEvent })
  }

  private handleBlur = (nativeEvent: FocusEvent) => {
    this.focusChange.emit({ focused: false, nativeEvent })
  }

  render() {
    return (
      <Host>
        <label part="root">
          <span part="prefix">
            <slot name="prefix" />
          </span>
          <input
            part="control"
            value={this.value}
            placeholder={this.placeholder}
            disabled={this.disabled}
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
          <slot name="message" />
        </div>
      </Host>
    )
  }
}
