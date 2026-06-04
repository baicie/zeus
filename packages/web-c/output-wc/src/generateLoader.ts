// packages/web-c/output-wc/src/generateLoader.ts
// Generates loader.js for lazy loading mode

export function generateLoader(): string {
  return `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

const definedRegistries = new WeakSet();

export function defineCustomElements(options = {}) {
  const registry =
    options.registry ??
    (typeof customElements !== "undefined" ? customElements : undefined);

  if (!registry) {
    return;
  }

  if (definedRegistries.has(registry)) {
    return;
  }

  definedRegistries.add(registry);

  bootstrapLazy(components, {
    registry,
  });
}

export const defineLazyElements = defineCustomElements;
`
}

export function generateAutoEntry(): string {
  return `import { defineCustomElements } from "./loader.js";

defineCustomElements();

export {};
`
}

export function generateLazyIndex(): string {
  return `export {
  defineCustomElements,
  defineLazyElements,
} from "./loader.js";
`
}
