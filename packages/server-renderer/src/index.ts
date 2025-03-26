// 导出服务端渲染和 hydration 相关功能
export { renderToString } from './renderToString'
export { renderToStream } from './renderToStream'
export { hydrate } from './hydrate'

// 共享配置
export const ssrConfig = {
  context: null,
  registry: null,
  count: 0,
  done: false,
}
