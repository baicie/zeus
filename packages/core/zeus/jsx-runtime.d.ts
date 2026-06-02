import type { JSXValue } from './dist/zeus'

export declare const Fragment: symbol
export declare function jsx(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
export declare function jsxs(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
export declare function jsxDEV(
  type: string | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
