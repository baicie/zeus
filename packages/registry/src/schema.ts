export type RegistryFramework = 'react' | 'vue'

export type RegistryItemType = 'component' | 'style' | 'lib' | 'hook' | 'block'

export interface RegistryFile {
  path: string
  content: string
}

export interface RegistryDependency {
  name: string
  version?: string
  dev?: boolean
}

export interface RegistryItem {
  name: string
  type: RegistryItemType
  framework: RegistryFramework
  description?: string
  dependencies?: RegistryDependency[]
  registryDependencies?: string[]
  files: RegistryFile[]
  docs?: string
}
