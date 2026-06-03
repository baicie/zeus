# @zeus-js/output-icons (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

export interface IconSource {
  /**
   * Icon name.
   *
   * Example:
   *   check
   *   chevron-down
   */
  name: string
  /**
   * Full svg source.
   */
  svg: string
  /**
   * Optional display name.
   */
  title?: string
}
export interface OutputIconsOptions {
  /**
   * Icon source list.
   *
   * MVP 先支持内联 icons。
   * 后续可以扩展 from: string | string[] 读取 svg 文件。
   */
  icons: IconSource[]
  /**
   * Output root.
   *
   * @default 'icons'
   */
  outDir?: string
  /**
   * Emit raw svg files.
   *
   * @default true
   */
  svg?: boolean
  /**
   * Emit React static icon components.
   *
   * @default true
   */
  react?: boolean | ReactIconOutputOptions
  /**
   * Emit Vue static icon components.
   *
   * @default true
   */
  vue?: boolean | VueIconOutputOptions
  /**
   * Emit static custom elements.
   *
   * @default false
   */
  wc?: boolean | StaticWcIconOutputOptions
  /**
   * Whether to emit d.ts files.
   *
   * @default true
   */
  dts?: boolean
}
interface ReactIconOutputOptions {
  outDir?: string
}
interface VueIconOutputOptions {
  outDir?: string
}
interface StaticWcIconOutputOptions {
  outDir?: string
  /**
   * Example:
   *   tagPrefix: 'z-icon-'
   *   check -> z-icon-check
   *
   * @default 'z-icon-'
   */
  tagPrefix?: string
}

export declare function icons(options: OutputIconsOptions): ZeusComponentPlugin

export { icons as default }
```
