// packages/web-c/output-wc/src/generateLoader.ts
// Generates loader.js for lazy loading mode

export function generateLoader(): string {
  return `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

const componentsByTagName = new Map(
  components.map(component => [component.tagName, component]),
);

function resolveRegistry(options) {
  return options.registry ??
    (typeof customElements === "undefined" ? undefined : customElements);
}

export function defineCustomElement(tagName, options = {}) {
  const registry = resolveRegistry(options);

  if (!registry) {
    return;
  }

  const component = componentsByTagName.get(tagName);

  if (!component) {
    throw new Error(\`[zeus:web-c] Unknown custom element: <\${tagName}>.\`);
  }

  bootstrapLazy([component], { registry });
}

export function defineCustomElements(options = {}) {
  for (const component of components) {
    defineCustomElement(component.tagName, options);
  }
}

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
  defineCustomElement,
  defineCustomElements,
} from "./loader.js";
`
}
