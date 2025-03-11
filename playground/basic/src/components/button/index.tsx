import { Component } from '@zeus/core'

@Component({
  tag: 'zeus-button',
  shadow: true
})
export function Button(props: { label: string }) {
  return (
    <button class="zeus-button">
      {props.label}
    </button>
  )
} 