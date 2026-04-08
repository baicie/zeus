import type { JSXElement } from '@zeus-js/core'

export default function HomeView(): JSXElement {
  return (
    <section class="card">
      <h2>Babel JSX Compiler Playground</h2>
      <p>
        这个 playground 使用 Vite + Babel transform，在构建阶段调用新的 Zeus JSX
        编译器插件。
      </p>
      <ul>
        <li>Counter: 信号响应式与事件处理</li>
        <li>List: 列表渲染与状态更新</li>
        <li>JSX Syntax: Fragment/条件/style/ref 示例</li>
      </ul>
    </section>
  )
}
