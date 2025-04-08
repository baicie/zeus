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

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| `hmr` | `boolean` | `true` | 是否启用热更新 |
| `autoImport` | `boolean` | `false` | 是否自动导入组件 |
| `include` | `string \| RegExp \| (string \| RegExp)[]` | `['.jsx', '.tsx']` | 包含的文件匹配模式 |
| `exclude` | `string \| RegExp \| (string \| RegExp)[]` | `[/node_modules/]` | 排除的文件匹配模式 |
| `customElementsPrefix` | `string` | `undefined` | 自定义元素名称前缀 |
| `webComponentsMode` | `'shadow' \| 'light' \| 'auto'` | `'shadow'` | Web Components 模式 |
| `optimizeSlots` | `boolean` | `true` | 是否优化 slots 处理 |
| `compiler` | `CompilerOptions` | `{}` | 传递给 Zeus 编译器的选项 |

## 高级用法

### 自定义元素支持

插件支持 Zeus 的 Web Components 模式，可以通过设置 `webComponentsMode` 选项来控制：

```js
zeusPlugin({
  webComponentsMode: 'light', // 使用无 Shadow DOM 模式
  customElementsPrefix: 'z-' // 设置自定义元素前缀
})
```

### 热更新优化

插件提供了针对 Zeus 框架的 HMR 优化，在开发过程中保持状态：

```js
zeusPlugin({
  hmr: true, // 启用热更新 (默认)
})
```

## License

MIT
