import type { Plugin } from 'vite'
import { commonTransform } from './utils'

export function zeusPlugin(): Plugin {
  return {
    name: 'vite:zeus',
    enforce: 'pre', // 在其他插件之前运行
    config() {
      return {
        esbuild: {
          // 禁用 esbuild 的 JSX 转换，使用我们自己的
          jsx: 'preserve',
        },
      }
    },
    transform: commonTransform,
  }
}
