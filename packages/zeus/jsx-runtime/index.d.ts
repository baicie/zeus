import type { ReservedProps } from '@zeus-js/runtime-dom'

/**
 * JSX runtime types for Zeus Framework
 *
 * Loaded automatically when tsconfig.json has:
 *   "jsxImportSource": "@zeus-js/core"
 *
 * This file provides:
 * 1. Type declarations for jsx/jsxs/jsxDEV/Fragment (used by TypeScript for type-checking JSX)
 * 2. JSX namespace with IntrinsicElements (all valid HTML/SVG tags)
 *
 * NOTE: These functions are never actually called at runtime.
 * The Zeus compiler transforms JSX into template() calls directly.
 */
export {
  h as jsx,
  h as jsxDEV,
  h as jsxs,
  Fragment,
} from '@zeus-js/runtime-dom'

declare global {
  namespace JSX {
    interface IntrinsicAttributes extends ReservedProps {}
  }
}

export {}
