// packages/web-c/output-wc/src/generateLoader.ts
// Generates loader.js for lazy loading mode

/**
 * Import this from `@zeus-js/web-c-runtime` in generated loaders. The runtime
 * renames the export when its loader contract changes incompatibly, so a
 * consumer build that mixes them fails with a missing-export error naming the
 * ABI instead of misbehaving at runtime (RFC-010).
 */
export const WC_RUNTIME_ABI_IMPORT = 'ZEUS_WC_RUNTIME_ABI_1'

export function generateLoader(): string {
  return `import { bootstrapLazy, ${WC_RUNTIME_ABI_IMPORT} } from "@zeus-js/web-c-runtime";
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
