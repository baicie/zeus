# @zeus-js/bundler-plugin

Zeus 框架的官方打包器插件，支持主流打包工具，提供 JSX 编译、热更新和优化功能。

## 安装

```bash
npm install @zeus-js/bundler-plugin --save-dev
# 或
yarn add @zeus-js/bundler-plugin -D
# 或
pnpm add @zeus-js/bundler-plugin -D
```

## 支持的打包器

- ✅ **Vite** - 现代前端构建工具
- ✅ **Webpack** - 经典模块打包器
- ✅ **Rspack** - 基于 Rust 的高性能打包器
- ✅ **Rollup** - ES 模块打包器
- ✅ **Rolldown** - 下一代打包器 (Rust)
- ✅ **esbuild** - 超快 JavaScript 打包器
- ✅ **Parcel** - 零配置打包器
- ✅ **Farm** - 基于 Rust 的 Vite 替代品
- ✅ **Turbopack** - Vercel 的高性能打包器
- ✅ **Bun** - 全新的 JavaScript 运行时和打包器

## 核心架构

```
tools/bundle-plugin/
├── core/              # 核心编译逻辑
│   ├── compiler.ts    # 主编译器接口
│   └── index.ts       # 核心导出
├── adapters/          # 打包器适配器
│   ├── vite.ts        # Vite 适配器
│   ├── webpack.ts     # Webpack 适配器
│   ├── rollup.ts      # Rollup 适配器
│   ├── rolldown.ts    # Rolldown 适配器
│   ├── rspack.ts      # Rspack 适配器
│   ├── esbuild.ts     # esbuild 适配器
│   ├── parcel.ts      # Parcel 适配器
│   ├── farm.ts        # Farm 适配器
│   ├── turbopack.ts   # Turbopack 适配器
│   ├── bun.ts         # Bun 适配器
│   └── index.ts       # 适配器导出
└── src/
    └── index.ts       # 主入口
```

## 使用方法

### Vite

```typescript
import { vite } from '@zeus-js/bundler-plugin'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vite({
      hmr: true,
      customElementsPrefix: 'zeus-',
      webComponentsMode: 'shadow',
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: [/node_modules/],
    }),
  ],
})
```

### Webpack

```javascript
const { webpack } = require('@zeus-js/bundler-plugin')

module.exports = {
  plugins: [
    new webpack.WebpackZeusPlugin({
      hmr: true,
      customElementsPrefix: 'zeus-',
      webpack: {
        parallel: true,
        cacheStrategy: 'filesystem',
      },
    }),
  ],
}
```

### Rollup

```javascript
import { rollup } from '@zeus-js/bundler-plugin'

export default {
  plugins: [
    rollup({
      include: ['src/**/*.{js,jsx,ts,tsx}'],
      exclude: ['node_modules/**'],
      rollup: {
        sourcemap: true,
        enforce: 'pre',
      },
    }),
  ],
}
```

### Rolldown

```javascript
import { rolldown } from '@zeus-js/bundler-plugin'

export default {
  plugins: [
    rolldown({
      hmr: true,
      customElementsPrefix: 'zeus-',
      rolldown: {
        incremental: true,
        parallelism: 4,
      },
    }),
  ],
}
```

### Rspack

```javascript
const { rspack } = require('@zeus-js/bundler-plugin')

module.exports = {
  plugins: [
    new rspack.RspackZeusPlugin({
      experimental: true,
      customElementsPrefix: 'zeus-',
      rspack: {
        experimental: true,
        performanceLevel: 'balanced',
      },
    }),
  ],
}
```

### esbuild

```javascript
import { esbuild } from '@zeus-js/bundler-plugin'

const result = await esbuild.build({
  entryPoints: ['src/index.tsx'],
  bundle: true,
  plugins: [
    esbuild({
      jsxAutoImport: true,
      jsxFactory: 'React.createElement',
      esbuild: {
        jsxAutoImport: true,
        jsxFactory: 'React.createElement',
      },
    }),
  ],
})
```

### Parcel

```javascript
import { parcel } from '@zeus-js/bundler-plugin'

module.exports = {
  extends: '@parcel/config-default',
  transformers: {
    '*.{js,jsx,ts,tsx}': [parcel],
  },
}
```

### Farm

```javascript
import { farm } from '@zeus-js/bundler-plugin'

export default {
  plugins: [
    farm({
      hmr: true,
      customElementsPrefix: 'zeus-',
      farm: {
        hmr: true,
        lazyCompilation: false,
      },
    }),
  ],
}
```

### Turbopack (Next.js)

```javascript
const { turbopack } = require('@zeus-js/bundler-plugin')

module.exports = turbopack({
  experimental: true,
  customElementsPrefix: 'zeus-',
  turbopack: {
    experimental: true,
    memoryLimit: '2GB',
  },
})
```

### Bun

```javascript
import { bun } from '@zeus-js/bundler-plugin'

const result = await Bun.build({
  entrypoints: ['src/index.tsx'],
  plugins: [
    bun({
      hmr: true,
      customElementsPrefix: 'zeus-',
      bun: {
        nativeOptimization: true,
        macros: false,
      },
    }),
  ],
})
```

## 通用选项

所有打包器适配器都支持以下通用选项：

| 选项                   | 类型                            | 默认值                           | 描述                     |
| ---------------------- | ------------------------------- | -------------------------------- | ------------------------ |
| `hmr`                  | `boolean`                       | `true`                           | 是否启用热更新           |
| `customElementsPrefix` | `string`                        | `undefined`                      | 自定义元素名称前缀       |
| `webComponentsMode`    | `'shadow' \| 'light' \| 'auto'` | `'shadow'`                       | Web Components 模式      |
| `optimizeSlots`        | `boolean`                       | `true`                           | 是否优化 slots 处理      |
| `include`              | `string[]`                      | `['.jsx', '.tsx', '.js', '.ts']` | 包含的文件扩展名         |
| `exclude`              | `RegExp[]`                      | `[/node_modules/]`               | 排除的文件模式           |
| `compiler`             | `Record<string, any>`           | `{}`                             | 传递给 Zeus 编译器的选项 |

## 多入口支持

所有适配器都支持多入口配置：

```typescript
import { vite } from '@zeus-js/bundler-plugin'

export default defineConfig({
  plugins: [
    vite({
      include: [
        'src/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
        'pages/**/*.{js,jsx,ts,tsx}',
      ],
      exclude: [/node_modules/, /dist/, /\.test\./, /\.stories\./],
    }),
  ],
})
```

## 核心 API

### 直接使用编译器

```typescript
import { createZeusCompiler } from '@zeus-js/bundler-plugin'

const compiler = createZeusCompiler({
  hmr: true,
  customElementsPrefix: 'zeus-',
})

const result = compiler.transform(
  `
function App() {
  return <div>Hello Zeus!</div>
}
`,
  'App.tsx',
)
```

## 开发指南

### 添加新的打包器支持

1. 在 `adapters/` 目录下创建新的适配器文件
2. 实现相应的打包器插件接口
3. 在 `adapters/index.ts` 中导出
4. 更新文档和示例

### 扩展核心功能

1. 在 `core/` 目录下修改编译器逻辑
2. 添加新的转换规则
3. 更新类型定义
4. 编写测试

## 性能优化

- **增量编译**: 支持文件的增量编译和缓存
- **并行处理**: 在支持的打包器中启用并行编译
- **内存优化**: 智能的内存管理和垃圾回收
- **Tree Shaking**: 自动移除未使用的代码

## 故障排除

### 常见问题

1. **文件未被处理**: 检查 `include` 和 `exclude` 选项
2. **类型错误**: 确保安装了正确的类型定义
3. **热更新失效**: 检查 `hmr` 选项和开发服务器配置
4. **性能问题**: 调整 `parallel` 和缓存相关选项

### 调试模式

启用详细日志：

```typescript
const plugin = vite({
  // ... 其他选项
  compiler: {
    debug: true,
    verbose: true,
  },
})
```

## License

MIT
