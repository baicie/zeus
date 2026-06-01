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

export interface ReactIconOutputOptions {
  outDir?: string
}

export interface VueIconOutputOptions {
  outDir?: string
}

export interface StaticWcIconOutputOptions {
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

export interface NormalizedOutputIconsOptions {
  icons: NormalizedIconSource[]
  outDir: string
  svg: boolean
  react: false | Required<ReactIconOutputOptions>
  vue: false | Required<VueIconOutputOptions>
  wc: false | Required<StaticWcIconOutputOptions>
  dts: boolean
}

export interface NormalizedIconSource {
  name: string
  componentName: string
  wcTag: string
  svg: string
  title?: string
  viewBox: string
  innerSvg: string
}
