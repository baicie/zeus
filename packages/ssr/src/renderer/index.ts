// packages/ssr/src/renderer/index.ts

export interface SSRRenderer {
  renderToString(component: any): string
  renderToStream(component: any): ReadableStream
}

export function createSSRRenderer(): SSRRenderer {
  return {
    renderToString(component: any): string {
      // 实现SSR字符串渲染
      return ''
    },
    renderToStream(component: any): ReadableStream {
      // 实现SSR流式渲染
      return new ReadableStream()
    },
  }
}
