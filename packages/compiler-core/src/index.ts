import {
  compileWebComponentMacros,
  compiler,
  transformWebComponentMacros,
} from './binding.cjs'

export { compiler, compileWebComponentMacros, transformWebComponentMacros }

// Web Component 宏选项类型
export interface WebComponentMacroOptions {
  enableMacros?: boolean
  autoDetect?: boolean
  macroModule?: string
  preserveMacros?: boolean
  macros?: string[]
  mode?: string
  extractDefinitions?: boolean
}

// 宏结果类型
export interface WebComponentMacroResult {
  code: string
  macrosFound: boolean
  macros?: MacroDefinitions
}

// 宏定义类型
export interface MacroDefinitions {
  props?: MacroPropsDefinition
  emits?: MacroEmitsDefinition
  expose?: MacroExposeDefinition
}

export interface MacroPropsDefinition {
  source: string
  keys: string[]
}

export interface MacroEmitsDefinition {
  source: string
  events: string[]
}

export interface MacroExposeDefinition {
  source: string
  keys: string[]
}
