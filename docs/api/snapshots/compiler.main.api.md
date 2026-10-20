# @zeus-js/compiler (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export interface CompilerDiagnostic {
  code: string
  message: string
  severity: 'error' | 'warning'
  filename: string
  hint?: string
  span?: SourceSpan
}
export interface SourcePosition {
  offset: number
  line: number
  column: number
}
export interface SourceSpan {
  start: SourcePosition
  end: SourcePosition
}
export interface RawSourceMap {
  version: number
  file?: string
  sources: string[]
  sourceRoot?: string
  sourcesContent: Array<string | null>
  names: string[]
  mappings: string
}
export interface TransformModuleOptions {
  source: string
  filename: string
  target: 'dom' | 'ssr'
  runtimeModule: string
  delegateEvents: boolean
  sourceMap: boolean
  hmr?: boolean
}
export interface TransformModuleResult {
  code: string
  map: RawSourceMap | null
  diagnostics: CompilerDiagnostic[]
  hydrationPlan: HydrationPlan | null
}
export interface HydrationPlan {
  version: number
  components: HydrationComponentPlan[]
}
export interface HydrationComponentPlan {
  id: number
  templateId: string
  nodes: HydrationNodePlan[]
}
export interface HydrationNodePlan {
  id: string
  nodeId: number
  kind:
    | 'root'
    | 'element'
    | 'text'
    | 'component'
    | 'show'
    | 'for'
    | 'transition'
    | 'region'
  optional: boolean
  tagName?: string
  bindings: HydrationBindingPlan[]
}
export interface HydrationBindingPlan {
  id: number
  kind: 'text' | 'attr' | 'prop' | 'event' | 'spread'
  name?: string
  once: boolean
}
export declare const transformModule: (
  options: TransformModuleOptions,
) => TransformModuleResult

export { transformModule as default }
```
