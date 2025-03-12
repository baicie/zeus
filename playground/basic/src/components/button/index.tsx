import { Component, Prop, Event, Method } from '@zeus/core'

@Component({
  tag: 'zeus-button',
  shadow: true,
})
export class Button {
  @Prop()
  label!: string

  @Event('click')
  onClick(e: MouseEvent) {
    console.log('clicked')
  }

  @Method()
  focus() {
    console.log('focus')
  }

  render() {
    return (
      <button class="zeus-button" onClick={this.onClick}>
        {this.label}
      </button>
    )
  }
}
