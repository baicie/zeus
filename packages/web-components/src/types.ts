// Types for Web Components
import type { Component } from '@zeus-js/runtime-core'

export interface CustomElementOptions {
  // 是否使用shadowDOM
  shadow?: boolean
  // 是否使用模板
  delegatesFocus?: boolean
  // 自定义元素的模式
  mode?: 'open' | 'closed'
  // 要继承的基类
  extends?: string
}

export interface CustomElementProps {
  [key: string]: any
}

export type CustomElementComponent = (props: CustomElementProps) => any
