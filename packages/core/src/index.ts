export { ZeusElement } from './base'
export { useRef, useEvent } from './hooks'

// 组件装饰器
export interface ComponentOptions {
  tag: string
  shadow?: boolean
}

export function Component(options: ComponentOptions) {
  return function (target: Function): Function {
    return target
  }
}
