import { Component, Event, EventEmitter, h, Host, Prop } from '@stencil/core'

export type DemoButtonVariant = 'default' | 'outline'

@Component({
  tag: 'z-demo-button',
  styleUrl: 'z-demo-button.css',
  shadow: true,
})
export class ZDemoButton {
  @Prop({ reflect: true }) disabled = false
  @Prop({ reflect: true }) variant: DemoButtonVariant = 'default'

  @Event({ eventName: 'press' })
  press!: EventEmitter<{ nativeEvent: MouseEvent }>

  private handleClick = (nativeEvent: MouseEvent) => {
    if (this.disabled) {
      nativeEvent.preventDefault()
      nativeEvent.stopPropagation()
      return
    }

    this.press.emit({ nativeEvent })
  }

  render() {
    return (
      <Host>
        <button
          part="button"
          type="button"
          disabled={this.disabled}
          aria-disabled={this.disabled ? 'true' : undefined}
          onClick={this.handleClick}
        >
          <slot />
        </button>
      </Host>
    )
  }
}
