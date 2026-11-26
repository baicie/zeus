/**
 * Typed access to the two Zeus bindings the generated component types omit.
 *
 * `@zeus-web/*` ships `dist/wc/types/jsx.d.ts` generated from each component's
 * schema, and a schema describes *component properties*. Two things the
 * compiler supports on every element are therefore missing from the generated
 * type:
 *
 * - **`ref`** — the compiler hands the element to a callback. Used by
 *   `pages/user.tsx` and `pages/users.tsx` to attach listeners and to keep an
 *   imperative handle on the grid. Typed as absent, `ref={...}` is a
 *   `Property 'ref' does not exist` error on otherwise correct code.
 * - **`prop:name`** — assigns a *property* instead of setting an attribute.
 *   Required for any non-string value: `columns` on `zw-data-grid` is an array
 *   of column descriptors, and an attribute can only carry a string. Dropping
 *   the prefix compiles and then renders an empty grid. That is not a
 *   hypothetical: it is what happened when these call sites were changed to
 *   plain attributes to satisfy the type checker, and `check:admin` caught it
 *   as `aria-colcount="0"`.
 *
 * The generator (`packages/web-c/component-dts/src/generateJsxDts.ts` in Core)
 * now emits `ref` with the other common props, and `@zeus-web/*@0.1.0-beta.35`
 * carries it. What it emits is `(element: HTMLElement | null) => void` for
 * every tag, so `withRef` returns that same signature and lets the caller's own
 * type parameter narrow the callback — see the note on the function. `prop:`
 * still needs the same treatment in the generated type, so this module stays as
 * the bridge for that half.
 *
 * It is deliberately narrow. Both helpers spread a correctly-typed value rather
 * than casting the element to `any`, so every *other* prop stays checked — a
 * typo in `variant` is still an error — and the workaround greps to one file.
 *
 * Usage:
 *
 *   <zw-dialog {...withRef<HTMLElement>(bindDialog)} open={dialogOpen()} />
 *   <zw-data-grid {...withProp('columns', columns)} {...withProp('rows', rows)} />
 */
/**
 * A `ref` binding, typed.
 *
 * The callback signature is what the compiler actually calls, so the element
 * type is the caller's to name and a wrong handler still fails.
 */
export function withRef<T extends Element>(
  ref: (element: T | null) => void,
): { ref: (element: HTMLElement | null) => void } {
  /*
   * The returned signature says `HTMLElement`, and the callback narrows.
   *
   * `@zeus-web/*@0.1.0-beta.35` generates `ref?: (element: HTMLElement | null)
   * => void` on every intrinsic element — the typed element a component is
   * declared with, and the callback a caller supplies, do not have to agree at
   * the type level because the compiler passes whatever the tag constructs.
   * Returning `(element: T | null) => void` from here made the two disagree in
   * the direction TypeScript rejects: a function accepting only `DialogElement`
   * cannot stand where one accepting any `HTMLElement` is expected.
   *
   * The narrowing the caller asked for still happens — `withRef<DialogElement>`
   * types the callback's parameter — and the runtime value is that element.
   */
  return { ref: ref as (element: HTMLElement | null) => void }
}

/**
 * A `prop:` binding, typed.
 *
 * The value's type is carried through, so the property name and the value it is
 * given cannot silently disagree at the call site.
 */
export function withProp<Name extends string, Value>(
  name: Name,
  value: Value,
): Record<`prop:${Name}`, Value> {
  return { [`prop:${name}`]: value } as Record<`prop:${Name}`, Value>
}
