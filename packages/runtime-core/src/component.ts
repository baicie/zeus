import { effect, reactive, shallowReactive } from '@zeusjs/reactivity'
import { isFunction, isObject } from '@zeusjs/shared'
import { ShapeFlags } from './constants'
import type { VNode } from './vnode'

export interface ComponentInternalInstance {
  type: Component
  vnode: VNode
  props: Record<string, any>
  attrs: Record<string, any>
  slots: Record<string, any>
  setupState: any
  render: Function | null
  isMounted: boolean
  parent: ComponentInternalInstance | null
  provides: Record<string, any>
  effects: any[]
  next: VNode | null
  subTree: VNode | null
  update: Function | null
  emit: (event: string, ...args: any[]) => void
}

export type Component<P = any> = ComponentOptions<P> | Function

export interface ComponentOptions<P = {}, RawBindings = {}> {
  name?: string
  props?: Record<string, any>
  emits?: string[] | Record<string, any>
  setup?: (props: P, ctx: { emit: any }) => RawBindings | Function
  render?: Function
  components?: Record<string, Component>
  inheritAttrs?: boolean
}

// 当前实例
let currentInstance: ComponentInternalInstance | null = null

export function setCurrentInstance(instance: ComponentInternalInstance | null) {
  currentInstance = instance
}

export function getCurrentInstance(): ComponentInternalInstance | null {
  return currentInstance
}

export function createComponentInstance(
  vnode: VNode,
  parent: ComponentInternalInstance | null
): ComponentInternalInstance {
  const instance: ComponentInternalInstance = {
    type: vnode.type as Component,
    vnode,
    props: {},
    attrs: {},
    slots: {},
    setupState: {},
    render: null,
    isMounted: false,
    parent,
    provides: parent ? parent.provides : Object.create(null),
    effects: [],
    next: null,
    subTree: null,
    update: null,
    emit: () => {},
  }

  instance.emit = (event: string, ...args: any[]) => {
    // 实现事件发射逻辑
  }

  return instance
}

export function setupComponent(instance: ComponentInternalInstance) {
  const { props, children } = instance.vnode

  // 初始化 props
  instance.props = shallowReactive(props || {})

  // 初始化 slots
  instance.slots = children || {}

  // 调用 setup 函数
  setupStatefulComponent(instance)
}

function setupStatefulComponent(instance: ComponentInternalInstance) {
  const Component = instance.type as ComponentOptions

  // 创建渲染上下文
  const setupContext = {
    attrs: instance.attrs,
    slots: instance.slots,
    emit: instance.emit,
    expose: () => {},
  }

  // 设置当前实例
  setCurrentInstance(instance)

  let setupResult
  if (Component.setup) {
    setupResult = Component.setup(instance.props, setupContext)
  }

  // 清除当前实例
  setCurrentInstance(null)

  // 处理 setup 返回值
  handleSetupResult(instance, setupResult)
}

function handleSetupResult(
  instance: ComponentInternalInstance,
  setupResult: any
) {
  if (isFunction(setupResult)) {
    // 如果返回函数，则作为 render 函数
    instance.render = setupResult
  } else if (isObject(setupResult)) {
    // 如果返回对象，则作为响应式状态
    instance.setupState = reactive(setupResult)
  }

  // 如果组件有 render 选项，使用它
  if (!instance.render && (instance.type as ComponentOptions).render) {
    instance.render = (instance.type as ComponentOptions).render
  }
}
