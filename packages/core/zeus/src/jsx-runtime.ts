import type { JSXValue } from '@zeus-js/runtime-dom'

export type { JSX } from './jsx'

export const Fragment: symbol = Symbol.for('zeus.fragment')

/** Toolchain boundary: Zeus JSX must be lowered before execution. */
export function jsx(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  throw new Error(
    '[ZEUS_JSX_COMPILATION_REQUIRED] Compile JSX with @zeus-js/vite-plugin or @zeus-js/compiler before execution.',
  )
}

export { jsx as jsxs, jsx as jsxDEV }
