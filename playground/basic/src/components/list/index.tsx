import { Component, Prop } from '@zeus.js/core'
import { For, Show } from '@zeus.js/core'

@Component({
  tag: 'zeus-list',
  shadow: true,
})
export class List {
  @Prop()
  items!: string[]

  render() {
    return (
      <div class="zeus-list">
        <Show when={this.items.length > 0} fallback={<div>No items</div>}>
          <For each={this.items}>
            {(item, index) => (
              <div class="list-item">
                {index + 1}. {item}
              </div>
            )}
          </For>
        </Show>
      </div>
    )
  }
}
