// packages/web-c/output-wc/src/generateLoader.ts
// Generates loader.js for lazy loading mode

export function generateLoader(): string {
  return `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

const componentsByTagName = new Map(
  components.map(component => [component.tagName, component]),
);

const definedTagsByRegistry = new WeakMap();

function resolveRegistry(options) {
  return options.registry ??
    (typeof customElements === "undefined" ? undefined : customElements);
}

function getDefinedTags(registry) {
  let definedTags = definedTagsByRegistry.get(registry);

  if (!definedTags) {
    definedTags = new Set();
    definedTagsByRegistry.set(registry, definedTags);
  }

  return definedTags;
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

  const definedTags = getDefinedTags(registry);

  if (definedTags.has(tagName) || registry.get(tagName)) {
    definedTags.add(tagName);
    return;
  }

  bootstrapLazy([component], { registry });

  definedTags.add(tagName);
}

export function defineCustomElements(options = {}) {
  for (const component of components) {
    defineCustomElement(component.tagName, options);
  }
}

export const defineLazyElement = defineCustomElement;
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
  defineCustomElement,
  defineCustomElements,
  defineLazyElement,
  defineLazyElements,
} from "./loader.js";
`
}
