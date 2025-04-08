# @zeus-js/vite-plugin-zeus

Zeus 框架的官方 Vite 插件，提供 JSX 编译、热更新和优化功能。

## 安装

```bash
npm install @zeus-js/vite-plugin-zeus --save-dev
# 或
yarn add @zeus-js/vite-plugin-zeus -D
# 或
pnpm add @zeus-js/vite-plugin-zeus -D
```

## 使用方法

```js
// vite.config.js
import { defineConfig } from 'vite'
import zeusPlugin from '@zeus-js/vite-plugin-zeus'

export default defineConfig({
  plugins: [
    zeusPlugin({
      // 配置选项
      hmr: true,
      webComponentsMode: 'shadow',
      optimizeSlots: true
    })
  ]
})
```

## 选项

- `hmr`: 是否启用热更新 (默认: true)
- `webComponentsMode`: Web Components 模式，可选 'shadow'|'light'|'auto' (默认: 'shadow')
- `optimizeSlots`: 是否优化 slots 处理 (默认: true)
- `customElementsPrefix`: 自定义元素名称前缀 (可选)
- `compiler`: 传递给 Zeus 编译器的选项 (可选)

## License

MIT
