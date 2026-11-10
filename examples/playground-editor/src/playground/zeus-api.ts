/**
 * Shape of the generated Zeus API completion table.
 *
 * Kept in its own module so the generated file imports a type rather than
 * duplicating the interface, and so the editor can import the type without
 * pulling in the data.
 */
export interface ApiCompletion {
  /** Public export name, for example `createSignal`. */
  readonly name: string
  /** One-line signature taken from the published declaration. */
  readonly signature: string
  /** Doc comment collapsed to a single line, empty when undocumented. */
  readonly documentation: string
  /** `function` | `component` | `constant`. */
  readonly kind: string
}
