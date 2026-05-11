// Custom component usage
import { Show } from '@zeus-js/runtime-dom';
interface Props {
  title: string;
  count?: number;
}
export function MyComponent(props: Props) {
  return <div className="component">
      <h1>{props.title}</h1>
      <Show when={props.count !== undefined}>
        <span>Count: {props.count}</span>
      </Show>
    </div>;
}

// Nested components
export function ParentComponent() {
  return <div>
      <MyComponent title="Hello" />
      <MyComponent title="World" count={5} />
    </div>;
}