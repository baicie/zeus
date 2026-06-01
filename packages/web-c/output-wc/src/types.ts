export interface OutputWCOptions {
  /**
   * Output directory for Web Component entries.
   *
   * @default 'dist/wc'
   */
  outDir?: string

  /**
   * Raw Zeus ComponentManifest output file.
   *
   * @default 'dist/zeus.components.json'
   */
  manifestFile?: string | false

  /**
   * Custom Elements Manifest output file.
   *
   * @default 'dist/custom-elements.json'
   */
  customElementsFile?: string | false

  /**
   * Whether to emit basic d.ts for native Web Components.
   *
   * Full cross-framework dts will be handled in later phases.
   *
   * @default true
   */
  dts?: boolean

  /**
   * Whether to emit JSX intrinsic element declarations.
   *
   * @default true
   */
  jsxDts?: boolean

  /**
   * Strip tag prefix from output file name.
   *
   * Example:
   *   stripPrefix: 'z-'
   *   z-button -> button.js
   *
   * Default keeps full tag:
   *   z-button -> z-button.js
   */
  stripPrefix?: string | false

  /**
   * File name formatter.
   * Higher priority than stripPrefix.
   */
  fileName?: (tag: string) => string

  /**
   * Whether to generate one wc/index.js entry that imports all components.
   *
   * @default true
   */
  index?: boolean

  /**
   * Whether to warn when two components map to the same file name.
   *
   * @default true
   */
  warnOnFileNameCollision?: boolean
}
