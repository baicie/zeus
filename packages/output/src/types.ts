export interface OutputTarget {
  type: 'react' | 'vue' | 'angular' | 'web-components'
  outDir: string
  componentCorePackage?: string // 例如 @zeus.js/core
  proxiesFile?: string // 生成的代理文件位置
}

export interface OutputOptions {
  targets: OutputTarget[]
  components: ComponentMeta[] // 从编译器收集的组件信息
}

export interface ComponentMeta {
  tagName: string
  className: string
  properties: PropertyMeta[]
  events: EventMeta[]
  methods: MethodMeta[]
}

export interface PropertyMeta {
  name: string
  type: string
}

export interface EventMeta {
  name: string
  eventName: string
}

export interface MethodMeta {
  name: string
  parameters: ParameterMeta[]
}

export interface ParameterMeta {
  name: string
  type: string
}
