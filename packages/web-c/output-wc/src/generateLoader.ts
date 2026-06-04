// packages/web-c/output-wc/src/generateLoader.ts
// Generates loader.js for lazy loading mode

export function generateLoader(): string {
  return `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

let defined = false;

export function defineCustomElements() {
  if (defined) {
    return;
  }

  if (typeof customElements === "undefined") {
    return;
  }

  bootstrapLazy(components);

  defined = true;
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
