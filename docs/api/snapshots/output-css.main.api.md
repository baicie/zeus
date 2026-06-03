# @zeus-js/output-css (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { ZeusComponentPlugin } from '@zeus-js/bundler-plugin'

export type CssProcessor = 'auto' | 'copy' | 'postcss' | 'sass' | 'less'
export interface OutputCssOptions {
  /**
   * CSS input file.
   *
   * @default auto-detect:
   * - src/styles.css
   * - src/style.css
   * - src/index.css
   * - src/styles.scss
   * - src/style.scss
   */
  input?: string
  /**
   * Output CSS file name.
   *
   * @default 'styles.css'
   */
  fileName?: string
  /**
   * Multiple CSS entries.
   */
  files?: CssEntry[]
  /**
   * CSS processor.
   *
   * @default 'auto'
   */
  processor?: CssProcessor
  /**
   * Minify CSS.
   *
   * @default false
   */
  minify?: boolean
  /**
   * Add CSS file to watch list.
   *
   * @default true
   */
  watch?: boolean
}
export interface CssEntry {
  input: string
  fileName?: string
  processor?: CssProcessor
}

export declare function css(
  options?: OutputCssOptions | string,
): ZeusComponentPlugin

export { css as default }
```
