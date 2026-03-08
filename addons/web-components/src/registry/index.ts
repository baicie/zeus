// packages/web-components/src/registry/index.ts

const componentRegistry = new Map<string, any>()

export function registerComponent(tagName: string, component: any): void {
  if (componentRegistry.has(tagName)) {
    throw new Error(`Component ${tagName} is already registered`)
  }

  componentRegistry.set(tagName, component)
  customElements.define(tagName, component)
}

export function unregisterComponent(tagName: string): void {
  if (componentRegistry.has(tagName)) {
    componentRegistry.delete(tagName)
    // Note: Custom elements cannot be unregistered in most browsers
  }
}

export function getRegisteredComponent(tagName: string): any {
  return componentRegistry.get(tagName)
}

export function getAllRegisteredComponents(): Map<string, any> {
  return new Map(componentRegistry)
}
