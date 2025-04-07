// import { useEffect, useState } from '@zeus-js/reactivity'

// interface Context<T> {
//   id: symbol
//   Provider: (props: { value: T; children: any }) => any
//   defaultValue?: T
// }

// // 上下文创建和使用（平台无关）
// export function createContext<T>(defaultValue?: T): Context<T> {
//   const id = Symbol('context')

//   return {
//     id,
//     Provider: (props: { value: T; children: any }) => {
//       return {
//         id,
//         value: props.value,
//         children: props.children,
//       }
//     },
//     defaultValue,
//   }
// }

// // 上下文存储
// const contexts = new Map()

// // 当前组件
// let currentComponent = null

// // 设置当前组件（供内部使用）
// export function setCurrentComponent(component: any) {
//   currentComponent = component
// }

// // 使用上下文
// export function useContext<T>(context: { id: symbol; defaultValue?: T }): T {
//   if (!currentComponent) {
//     throw new Error('useContext must be called within a component')
//   }

//   const value = contexts.get(context.id)
//   return value !== undefined ? value : context.defaultValue
// }

// // 提供上下文
// export function ContextProvider(
//   context: { id: symbol; value: any },
//   value: any
// ) {
//   contexts.set(context.id, value)
//   return () => contexts.delete(context.id)
// }
