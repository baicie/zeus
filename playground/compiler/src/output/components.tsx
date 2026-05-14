// Custom component usage
import { Show } from '@zeus-js/runtime-dom';
interface Props {
  title: string;
  count?: number;
}
export function MyComponent(props: Props) {
  return (() => {
    const _el$2 = _el$.firstChild;
    const _el$4 = _el$3.firstChild;
    const _el$3 = _el$.firstChild;
    setAttr(_el$3, "when", props.count !== undefined);
    return _el$;
  })();
}

// Nested components
export function ParentComponent() {
  return (() => {
    const _el$6 = _el$5.firstChild;
    const _el$7 = _el$5.firstChild;
    setAttr(_el$7, "count", 5);
    return _el$5;
  })();
}