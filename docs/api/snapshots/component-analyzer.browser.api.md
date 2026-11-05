# @zeus-js/component-analyzer (./browser) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export type ComponentPropType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'function'
  | 'unknown'
export interface ComponentManifest {
  schemaVersion: 1
  components: ComponentRecord[]
}
export interface ComponentRecord {
  tag: string
  name: string
  exportName: string
  source: string
  /**
   * Public props merged from runtime definitions, TypeScript types and metadata.
   * Used by declarations, documentation and framework wrapper types.
   */
  props: Record<string, ComponentProp>
  /**
   * Exact runtime props extracted from defineElement(options.props).
   * Lazy Proxy Elements must only consume this field.
   */
  runtimeProps?: Record<string, ComponentProp>
  /**
   * Validation messages explaining why runtime props could not be analyzed.
   */
  runtimePropsDiagnostics?: string[]
  events: Record<string, ComponentEvent>
  methods?: Record<string, ComponentMethod>
  models?: ComponentModel[]
  slots: Record<string, ComponentSlot>
  hostAttributes: string[]
  cssParts: string[]
  cssVars: Record<string, ComponentCssVar>
  description?: string
  meta?: {
    shadow?: boolean
    formAssociated?: boolean
    [key: string]: unknown
  }
}
export interface ComponentProp {
  type: ComponentPropType
  declaration?: ComponentPropDeclaration
  required?: boolean
  values?: string[]
  default?: unknown
  hasDefault?: boolean
  defaultStrategy?: 'static' | 'factory'
  reflect?: boolean
  attr?: string | false
  serialize?: boolean
  deserialize?: boolean
  description?: string
}
export interface ComponentPropDeclaration {
  reference?: string
  type: string
}
export interface ComponentEvent {
  key?: string
  name?: string
  reactName?: string
  detail?: Record<string, string>
  detailOptional?: string[]
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
  description?: string
}
export interface ComponentMethod {
  name: string
  description?: string
  parameters?: ComponentMethodParameter[]
  returns?: string
  async?: boolean
}
export interface ComponentMethodParameter {
  name: string
  type: string
  optional?: boolean
  rest?: boolean
}
export interface ComponentModel {
  prop: string
  event: string
  eventPath?: string
}
export interface ComponentSlot {
  name?: string
  description?: string
}
export interface ComponentCssVar {
  name: string
  description?: string
}
export interface AnalyzeFileResult {
  file: string
  components: ComponentRecord[]
  diagnostics: AnalyzerDiagnostic[]
}
export interface AnalyzerDiagnostic {
  level: 'warning' | 'error'
  file: string
  message: string
}
export interface AnalyzeFileOptions {
  file: string
  code: string
}

export declare function analyzeFile(
  options: AnalyzeFileOptions,
): AnalyzeFileResult

export declare const PORTABLE_GLOBAL_TYPE_REFERENCES: readonly [
  'AbortSignal',
  'AddEventListenerOptions',
  'Array',
  'Blob',
  'CustomEvent',
  'Date',
  'Element',
  'Event',
  'EventListenerOptions',
  'EventListenerOrEventListenerObject',
  'File',
  'FocusEvent',
  'FormData',
  'Function',
  'HTMLElement',
  'InputEvent',
  'KeyboardEvent',
  'Map',
  'MouseEvent',
  'Node',
  'Omit',
  'Partial',
  'Pick',
  'PointerEvent',
  'Promise',
  'PromiseLike',
  'Readonly',
  'ReadonlyArray',
  'ReadonlyMap',
  'ReadonlySet',
  'Record',
  'Required',
  'Set',
  'URL',
  'UIEvent',
]
export type PortableGlobalTypeReference =
  (typeof PORTABLE_GLOBAL_TYPE_REFERENCES)[number]

/**
 * Whether the prop type converts to and from an attribute without a codec.
 */
export declare function isAttributeBackedPropType(
  type: ComponentPropType,
): boolean
/**
 * The attribute a custom element observes for a prop, or `false` for a
 * property-only prop. Structured props are attribute-backed only with a
 * declared deserializer, and names are lowercase because HTML attribute names
 * are case-insensitive. Every output must use this so that it matches
 * `getCustomElementAttributeName` in `@zeus-js/runtime-dom`.
 */
export declare function getComponentAttributeName(
  propName: string,
  prop: ComponentProp,
): string | false
/**
 * The DOM event name a component dispatches for an `emits` entry: the
 * declared name, or the kebab-case form of its key. Matches the `emit` API of
 * `defineElement` in `@zeus-js/runtime-dom`.
 */
export declare function getComponentEventName(
  key: string,
  event: ComponentEvent,
): string
/** RFC-010 requires unique kebab-case DOM event names. */
export declare function isValidComponentEventName(name: string): boolean
```
