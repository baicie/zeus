// Global compile-time constants
declare var __DEV__: boolean
declare var __TEST__: boolean
declare var __BROWSER__: boolean
declare var __GLOBAL__: boolean
declare var __ESM_BUNDLER__: boolean
declare var __ESM_BROWSER__: boolean
declare var __CJS__: boolean
declare var __SSR__: boolean
declare var __VERSION__: string
declare var __COMPAT__: boolean

declare module '@babel/helper-module-imports' {
  export function addNamed(
    path: NodePath,
    name: string,
    moduleName: string,
    opts?: {
      nameHint?: string
      blockHoist?: boolean
    }
  ): t.Identifier
}

declare module '@babel/plugin-syntax-jsx'
