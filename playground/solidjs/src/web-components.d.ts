import type { Component } from 'solid-js'

// 定义 solid-counter 的属性类型
interface SolidCounterProps {
  id?: string
  start?: number | string
  label?: string
}

// 定义 solid-counter-shadow 的属性类型
interface SolidCounterShadowProps {
  id?: string
  start?: number | string
  label?: string
}

// 扩展 JSX IntrinsicElements
declare module 'solid-js' {
  namespace JSX {
    interface IntrinsicElements {
      'solid-counter': SolidCounterProps
      'solid-counter-shadow': SolidCounterShadowProps
    }
  }
}

export type { SolidCounterProps, SolidCounterShadowProps }
