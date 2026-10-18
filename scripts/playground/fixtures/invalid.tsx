import { Show } from '@zeus-js/zeus'

export const Broken = () => (
  <Show when={true} extra="unsupported">
    broken
  </Show>
)
