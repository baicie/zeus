import { ShapeFlags } from './constants'
import { isArray, isFunction, isObject, isString } from '@zeusjs/shared'

export const Fragment = Symbol('Fragment')
export const Text = Symbol('Text')
export const Comment = Symbol('Comment')

export interface VNode {
  type: any
  props: Record<string, any> | null
  key: string | number | symbol | null
  children: any
  el: Element | null
  shapeFlag: number
}

export function h(type: any, props?: any, children?: any): VNode {
  const vnode: VNode = {
    type,
    props,
    key: props?.key ?? null,
    children,
    el: null,
    shapeFlag: 0,
  }

  // 确定 shapeFlag
  if (isString(type)) {
    vnode.shapeFlag = ShapeFlags.ELEMENT
  } else if (isFunction(type)) {
    vnode.shapeFlag = ShapeFlags.FUNCTIONAL_COMPONENT
  } else if (isObject(type)) {
    vnode.shapeFlag = ShapeFlags.STATEFUL_COMPONENT
  }

  // 处理子节点的 shapeFlag
  if (isString(children) || typeof children === 'number') {
    vnode.shapeFlag |= ShapeFlags.TEXT_CHILDREN
  } else if (isArray(children)) {
    vnode.shapeFlag |= ShapeFlags.ARRAY_CHILDREN
  }

  return vnode
}
