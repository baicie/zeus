// packages/ssr/src/hydration/index.ts

export function hydrate(component: any, container: Element): void {
  // 实现水合逻辑
}

export function createHydrator(): {
  hydrate: (component: any, container: Element) => void
} {
  return {
    hydrate(component: any, container: Element) {
      // 水合实现
    },
  }
}
