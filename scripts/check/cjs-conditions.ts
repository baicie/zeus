/**
 * The CommonJS conditional-export shape a publishable package must have.
 *
 * ## Why this is its own module
 *
 * `check-package-cjs.ts` is a script: it walks the workspace, loads every
 * package's CJS entry and exits non-zero on a violation. Importing it to test
 * this predicate ran all of that, which needs built `dist` output — so the test
 * passed locally against leftovers and failed on CI with
 * `Cannot find module …/runtime-dom.cjs`.
 *
 * A pure predicate belongs in a module a test can import without side effects.
 */

export interface RequireConditions {
  production: string
  development: string
  default: string
}

/** Whether a conditional export reaches a CommonJS entry. */
export function hasRequireTarget(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  if (typeof record.require === 'string') return true

  if (record.require && typeof record.require === 'object') return true

  return Object.values(record).some(hasRequireTarget)
}

/**
 * Reads the three runtime conditions, or null when the shape is wrong.
 *
 * `types` is allowed here, and it has to come first.
 *
 * TypeScript requires `types` to precede the runtime conditions inside a
 * conditional export, and a CommonJS consumer needs a `.d.cts` to typecheck a
 * `require` import at all — without one it gets TS1479 or TS7016. So the
 * contract's three runtime conditions stay exactly as they were, and `types`
 * is read past rather than counted.
 *
 * Requiring a key count of three was the earlier shape, and it made adding
 * correct types look like a CJS contract violation:
 * `require conditions do not match the contract. received: null`.
 */
export function readRequireConditions(
  value: unknown,
): RequireConditions | null {
  if (!value || typeof value !== 'object') return null

  const requireValue = (value as Record<string, unknown>).require
  if (!requireValue || typeof requireValue !== 'object') return null

  const conditions = requireValue as Record<string, unknown>
  const { types, ...runtime } = conditions
  const keys = Object.keys(runtime)

  if (
    keys.length !== 3 ||
    keys[0] !== 'production' ||
    keys[1] !== 'development' ||
    keys[2] !== 'default' ||
    typeof runtime.production !== 'string' ||
    typeof runtime.development !== 'string' ||
    typeof runtime.default !== 'string' ||
    (types !== undefined && typeof types !== 'string')
  ) {
    return null
  }

  return runtime as unknown as RequireConditions
}
