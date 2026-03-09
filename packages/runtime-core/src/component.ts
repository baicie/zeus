// Component is a plain function that returns a real DOM node
export type ComponentFunction<P = any> = (props?: P) => Node | null

// Application interface
export interface App {
  mount(container: Element | string): void
  unmount(): void
  use(plugin: Plugin, options?: any): App
}

// Plugin type for app.use()
export type Plugin =
  | {
      install?: (app: App, options?: any) => void
    }
  | ((app: App, options?: any) => void)
