// packages/runtime-dom/src/renderer/index.ts

export interface RendererOptions {
  createElement: (tag: string) => Element
  createText: (text: string) => Text
  createComment: (text: string) => Comment
  insert: (child: Node, parent: Node, anchor?: Node) => void
  remove: (child: Node) => void
  setElementText: (el: Element, text: string) => void
  setText: (node: Text, text: string) => void
  patchProp: (el: Element, key: string, prevValue: any, nextValue: any) => void
}

export interface Renderer {
  render: (vnode: any, container: Element) => void
  createApp: (rootComponent: any) => any
}

export function createRenderer(options: RendererOptions): Renderer {
  return {
    render(vnode: any, container: Element) {
      // 实现渲染逻辑
    },
    createApp(rootComponent: any) {
      // 实现应用创建逻辑
    },
  }
}
