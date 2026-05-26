# @zeus-js/zeus

Unified entry point for the Zeus framework.

## render

```ts
function render(code: () => JSX.Element, element: Element): void
```

Renders a component tree into a DOM element.

```tsx
import { render } from '@zeus-js/zeus'

render(() => <App />, document.getElementById('root')!)
```

## state

See [State](/guide/state) guide.

## Show

See [Control Flow](/guide/control-flow) guide.

## For

See [Control Flow](/guide/control-flow) guide.

## defineElement

See [Web Components](/guide/web-components) guide.

## Host

See [Web Components](/guide/web-components) guide.

## Slot

See [Web Components](/guide/web-components) guide.
