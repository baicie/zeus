// Custom component usage
import { Show } from '@zeus-js/runtime-dom';
interface Props {
  title: string;
  count?: number;
}
export function MyComponent(props: Props) {
  return template("<div><h1></h1></div>");
}

// Nested components
export function ParentComponent() {
  return template("<div></div>");
}