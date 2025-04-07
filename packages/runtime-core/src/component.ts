// import { useMemo } from '@zeus-js/reactivity'

// 组件类型定义
export type PropsWithChildren<P = {}> = P & { children?: any }
export type Component<P = {}> = (props: PropsWithChildren<P>) => any
export type FunctionComponent<P = {}> = Component<P>

// 创建组件（平台无关）
export function createComponent<P>(Comp: Component<P>, props: P): any {
  return Comp(props as PropsWithChildren<P>)
}

// 抽象组件基础类（For、Show等的基础）
// 这是平台无关的实现，不包含DOM特定逻辑
export class AbstractFor<T, U> {
  each: () => T[]
  children: (item: T, index: number) => U

  constructor(props: {
    each: T[] | (() => T[])
    children: (item: T, index: number) => U
  }) {
    this.each =
      typeof props.each === 'function'
        ? (props.each as () => T[])
        : () => props.each as T[]
    this.children = props.children
  }

  process(): U[] {
    const items = this.each()
    return Array.isArray(items)
      ? items.map((item, index) => this.children(item, index))
      : []
  }
}

export class AbstractShow<T> {
  when: () => boolean
  children: T
  fallback?: T

  constructor(props: {
    when: boolean | (() => boolean)
    children: T
    fallback?: T
  }) {
    this.when =
      typeof props.when === 'function'
        ? (props.when as () => boolean)
        : () => !!props.when
    this.children = props.children
    this.fallback = props.fallback
  }

  process(): T | undefined {
    return this.when() ? this.children : this.fallback
  }
}

// 其他抽象实现...
