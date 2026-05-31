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

export interface NormalizedComponentDtsOptions {
  outDir: string
  stripPrefix: string | false
  fileName?: (tag: string) => string
  perComponent: boolean
  index: boolean
  jsx: boolean
}
