// Custom component usage
import { Show } from '@zeus-js/runtime-dom';
interface Props {
  title: string;
  count?: number;
}
export function MyComponent(props: Props) {
  return (() => {
    const _el$2 = _el$.firstChild;
    insert(_el$2, props.title);
    insert(_el$, createComponent(Show, {
      when: props.count !== undefined,
      children: (() => {
        insert(_el$3, props.count);
        return _el$3;
      })()
    }));
    return _el$;
  })();
}

// Nested components
export function ParentComponent() {
  return (() => {
    insert(_el$4, createComponent(MyComponent, {
      title: "Hello"
    }));
    insert(_el$4, createComponent(MyComponent, {
      title: "World",
      count: 5
    }));
    return _el$4;
  })();
}