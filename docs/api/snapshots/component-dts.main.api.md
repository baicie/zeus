# @zeus-js/component-dts (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import {
  ComponentRecord,
  ComponentManifest,
  ComponentEvent,
  ComponentProp,
} from '@zeus-js/component-analyzer'

export declare function generateComponentWCDts(
  component: ComponentRecord,
): string
export declare function generateWCIndexDts(
  manifest: ComponentManifest,
  options: {
    getComponentImportPath: (component: ComponentRecord) => string
  },
): string

export declare function generateWCJsxDts(manifest: ComponentManifest): string

export declare function generateReactDts(manifest: ComponentManifest): string

export declare function generateVueDts(manifest: ComponentManifest): string
export declare function generateVueGlobalDts(
  manifest: ComponentManifest,
): string

export interface DtsOutputFile {
  fileName: string
  source: string
}
export interface ComponentDtsOptions {
  /**
   * Output directory for wc dts files.
   *
   * @default 'wc'
   */
  outDir?: string
  /**
   * Strip tag prefix when generating file names.
   *
   * Example:
   *   z-button -> button.d.ts
   */
  stripPrefix?: string | false
  /**
   * Custom component file name.
   */
  fileName?: (tag: string) => string
  /**
   * Whether to generate per-component d.ts.
   *
   * @default true
   */
  perComponent?: boolean
  /**
   * Whether to generate wc/index.d.ts.
   *
   * @default true
   */
  index?: boolean
  /**
   * Whether to generate wc/jsx.d.ts.
   *
   * @default true
   */
  jsx?: boolean
}

export declare function generateWCDtsFiles(
  manifest: ComponentManifest,
  options?: ComponentDtsOptions,
): DtsOutputFile[]

export declare function generateLoaderDts(manifest: ComponentManifest): string

export declare function formatPropType(prop: ComponentProp): string
export declare function formatEventType(event: ComponentEvent): string
export declare function formatDetailType(detail: Record<string, string>): string
```
