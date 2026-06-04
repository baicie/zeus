// packages/web-c/output-wc/src/generateLoader.ts
// Generates loader.ts for lazy loading mode

export function generateLoader(): string {
  return `import { bootstrapLazy } from "@zeus-js/web-c-runtime";
import { components } from "./components.manifest.js";

const ZEUS_DEFINE_KEY = Symbol.for("zeus.web-c.defined");

function getDefineState() {
  const globalObject = globalThis;
  if (!globalObject[ZEUS_DEFINE_KEY]) {
    globalObject[ZEUS_DEFINE_KEY] = {};
  }
  return globalObject[ZEUS_DEFINE_KEY];
}

export function defineCustomElements(options) {
  const state = getDefineState();

  if (state.defined) {
    return;
  }

  state.defined = true;

  bootstrapLazy(components, {
    registry: options?.registry ?? customElements,
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
