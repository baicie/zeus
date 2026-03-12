/**
 * JSX runtime type declarations
 *
 * NOTE: These functions are NOT used at runtime.
 * JSX compiles to template() functions instead of h() calls.
 * These declarations only provide TypeScript type hints.
 */

import type { Component, JSXElement } from './jsx'

// Type declarations only - these functions are never called at runtime
// JSX compiles to template() functions instead of h() calls

export type { Component, ParentComponent } from './jsx'

// Declare the functions as ambient declarations
declare function h(
  type: string | Component<any>,
  props: Record<string, any> | null | undefined,
  ...children: any[]
): JSXElement

declare function jsx(
  type: string | Component<any>,
  props: Record<string, any>,
  key?: string | number | null,
): Node | JSXElement

declare function jsxs(
  type: string | Component<any>,
  props: Record<string, any>,
  key?: string | number | null,
): Node | JSXElement

declare function jsxDEV(
  type: string | Component<any>,
  props: Record<string, any>,
  key?: string | number | null,
  isStaticChildren?: boolean,
  debugInfo?: { fileName: string; lineNumber: number },
): Node | JSXElement

export { h, jsx, jsxs, jsxDEV }
