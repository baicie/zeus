// Component is a plain function that returns a real DOM node
export type ComponentFunction<P = any> = (props?: P) => Node

// Application interface
export interface App {
  mount(container: Element | string): void
  unmount(): void
}
