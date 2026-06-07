# @zeus-js/output-vue-wrapper (./runtime) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import * as vue from 'vue'

export interface ZeusVueModelOptions {
  prop: string
  event: string
  eventPath?: string
}
export interface ZeusVueContainerOptions {
  tagName: string
  displayName?: string
  defineCustomElement?: () => void
  props?: string[]
  events?: string[]
  slots?: string[]
  model?: ZeusVueModelOptions
  transformTag?: (tagName: string) => string
}
export declare function defineContainer(
  options: ZeusVueContainerOptions,
): vue.DefineSetupFnComponent<
  {
    [x: string]: /*elided*/ any
  },
  string[],
  {},
  {
    [x: string]: /*elided*/ any
  } & {
    [x: `on${Capitalize<string>}`]: ((...args: any[]) => any) | undefined
  },
  vue.PublicProps
>
```
