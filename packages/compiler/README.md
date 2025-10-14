# Zeus JSX Compiler

Zeus JSX 编译器是一个高效的 Babel 插件，将 JSX 语法转换为直接的 DOM 操作代码，无需虚拟 DOM，提供卓越的运行时性能。

## 特性

- 🚀 **零虚拟 DOM**：直接生成 DOM 操作代码
- ⚡ **模板优化**：静态内容提取为模板，减少运行时开销
- 🎯 **智能绑定**：高效的动态属性和事件绑定
- 🔧 **表达式优化**：编译时优化简单表达式
- 📦 **Tree Shaking**：只导入需要的运行时函数
- 🎨 **TypeScript 支持**：完整的类型定义

## 安装

```bash
npm install @zeus-js/compiler
# 或
pnpm add @zeus-js/compiler
```

## 使用方法

### 作为 Babel 插件

```javascript
// babel.config.js
module.exports = {
  plugins: [
    [
      '@zeus-js/compiler',
      {
        moduleName: '@zeus-js/runtime-dom',
        optimizeTemplates: true,
        inlineExpressions: true,
      },
    ],
  ],
}
```

### 在 Vite 中使用

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import zeusPlugin from '@zeus-js/vite-plugin-zeus'

export default defineConfig({
  plugins: [
    zeusPlugin({
      compiler: {
        moduleName: '@zeus-js/runtime-dom',
        optimizeTemplates: true,
      },
    }),
  ],
})
```

## 配置选项

```typescript
interface CompilerOptions {
  /** 运行时模块名称 */
  moduleName?: string
  /** 是否生成 source map */
  generateSourceMap?: boolean
  /** 是否优化模板 */
  optimizeTemplates?: boolean
  /** 是否内联简单表达式 */
  inlineExpressions?: boolean
  /** 自定义元素检测函数 */
  isCustomElement?: (tag: string) => boolean
  /** Web Components 模式 */
  webComponentsMode?: 'shadow' | 'light' | 'auto'
}
```

## 转换示例

### 输入 JSX

```jsx
function App() {
  const name = 'Zeus'
  const isVisible = true

  return (
    <div className={isVisible ? 'visible' : 'hidden'}>
      <h1>Hello {name}!</h1>
      <button onClick={() => console.log('clicked')}>Click me</button>
    </div>
  )
}
```

### 输出代码

```javascript
import { cloneTemplate, bindElement } from '@zeus-js/runtime-dom'

// 模板定义
const _tmpl$1 = createTemplate(
  `<div><h1>Hello </h1><button>Click me</button></div>`
)

function App() {
  const name = 'Zeus'
  const isVisible = true

  const _el$ = cloneTemplate(_tmpl$1)
  bindElement(_el$, 'attribute', 'className', isVisible ? 'visible' : 'hidden')
  bindElement(_el$, 'text', '', name)
  bindElement(_el$, 'event', 'onClick', () => console.log('clicked'))

  return _el$
}
```

## 性能优势

1. **无虚拟 DOM 开销**：直接操作真实 DOM
2. **模板复用**：静态内容提取为可复用的模板
3. **编译时优化**：简单表达式在编译时计算
4. **最小化运行时**：只包含必要的运行时函数

## 与 dom-expressions 的关系

Zeus 编译器参考了 [dom-expressions](https://github.com/ryansolid/dom-expressions) 的设计理念：

- 使用模板字符串进行静态内容优化
- 动态绑定通过直接的 DOM 操作实现
- 编译时表达式优化
- 高效的属性绑定机制

## 开发

```bash
# 安装依赖
pnpm install

# 构建
pnpm build

# 开发模式
pnpm dev

# 测试
pnpm test
```

## 许可证

MIT
