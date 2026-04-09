# Zeus 插件完善方案

> 本文档描述了如何参考 `vite-plugin-solid` 的实现来完善 `vite-plugin-zeus` 和 `rollup-plugin-zeus`。

## 背景

`vite-plugin-solid` 是一个成熟且功能完整的 Vite 插件实现，提供了丰富的配置选项和完整的功能覆盖。`@zeus-js/compiler` 作为类似的 JSX 编译器，其插件实现需要参考 `vite-plugin-solid` 的设计来完善功能。

## 当前问题分析

### vite-plugin-zeus 当前问题

| 问题 | 当前实现 | 问题描述 |
|------|----------|----------|
| 接口过于简单 | 只有 `include/exclude` 是 `RegExp` 类型 | 缺少 `FilterPattern` 支持，不够灵活 |
| 缺少 Vite 钩子 | 只有 `transform` 和 `handleHotUpdate` | 没有 `config`、`configEnvironment`、`configResolved` 等关键钩子 |
| 缺少 HMR 支持 | 空实现 | 没有运行时模块注入和热更新支持 |
| 缺少 SSR 配置 | 无 | 没有 `ssr` 模式支持 |
| 缺少 Babel 配置扩展 | 无 | 没有 `babel` 选项让用户自定义 Babel 配置 |
| 缺少开发/生产模式区分 | 无 | 没有 `dev`/`hot` 选项控制行为 |

### rollup-plugin-zeus 当前问题

| 问题 | 当前实现 | 问题描述 |
|------|----------|----------|
| 接口过于简单 | 只有基本选项 | 缺少 SSR、generate 等关键配置 |
| 缺少构建钩子 | 只有 `transform` | 没有 `buildStart`/`renderStart` 等钩子 |
| 缺少 SSR 配置 | 无 | 没有 `generate` 选项传给编译器 |
| Babel 配置不够灵活 | 硬编码 preset-typescript | 没有允许用户扩展 preset/plugin |

## 设计方案

### 1. vite-plugin-zeus 完善内容

#### 1.1 Options 接口增强

```typescript
export interface ExtensionOptions {
  typescript?: boolean
}

export interface Options {
  // 文件过滤
  include?: FilterPattern
  exclude?: FilterPattern

  // 模式控制
  dev?: boolean
  ssr?: boolean
  hot?: boolean

  // 文件扩展名
  extensions?: (string | [string, ExtensionOptions])[]

  // Babel 配置
  babel?:
    | babel.TransformOptions
    | ((source: string, id: string, ssr: boolean) => babel.TransformOptions)
    | ((source: string, id: string, ssr: boolean) => Promise<babel.TransformOptions>)

  // 编译器配置
  zeus?: CompilerOptions
}
```

#### 1.2 新增配置项说明

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `include` | `FilterPattern` | `/\.[jt]sx?$/` | 插件处理的文件匹配模式 |
| `exclude` | `FilterPattern` | `/node_modules/` | 插件排除的文件匹配模式 |
| `dev` | `boolean` | `command === 'serve'` | 是否注入开发模式，注入 `@zeus-js/dev` |
| `ssr` | `boolean` | `false` | 是否启用 SSR 模式 |
| `hot` | `boolean` | `true` | 是否启用 HMR（开发模式且非生产环境） |
| `extensions` | `(string \| [string, ExtensionOptions])[]` | `[]` | 额外的文件扩展名处理 |
| `babel` | `TransformOptions \| function` | `{}` | 自定义 Babel 配置 |
| `zeus` | `CompilerOptions` | `{}` | 编译器特定配置（generate, hydratable 等） |

#### 1.3 Vite 钩子实现

##### 1.3.1 `config` 钩子

```typescript
async config(userConfig, { command }) {
  const replaceDev = options.dev === true || (options.dev !== false && command === 'serve')

  return {
    resolve: {
      conditions: isVite6
        ? undefined
        : [
            'zeus',
            ...(replaceDev ? ['development'] : []),
            ...(userConfig.mode === 'test' && !options.ssr ? ['browser'] : []),
          ],
      dedupe: ['@zeus-js/runtime', '@zeus-js/runtime-dom', '@zeus-js/signal'],
      alias: [{ find: /^zeus-refresh$/, replacement: runtimePublicPath }],
    },
    optimizeDeps: {
      include: ['@zeus-js/runtime', '@zeus-js/runtime-dom', '@zeus-js/signal'],
      exclude: [],
      ...(isVite8
        ? { rolldownOptions: { transform: { jsx: 'preserve' as const } } }
        : {}),
    },
    ssr: solidPkgsConfig?.ssr,
  }
}
```

##### 1.3.2 `configEnvironment` 钩子（Vite 6+）

```typescript
async configEnvironment(name, config, opts) {
  config.resolve ??= {}

  // 设置环境特定的 conditions
  if (config.resolve.conditions == null) {
    const { defaultClientConditions, defaultServerConditions } = await import('vite')
    if (config.consumer === 'client' || name === 'client' || opts.isSsrTargetWebworker) {
      config.resolve.conditions = [...defaultClientConditions]
    } else {
      config.resolve.conditions = [...defaultServerConditions]
    }
  }

  config.resolve.conditions = [
    'zeus',
    ...(replaceDev ? ['development'] : []),
    ...(isTestMode && !opts.isSsrTargetWebworker && !options.ssr ? ['browser'] : []),
    ...config.resolve.conditions,
  ]
}
```

##### 1.3.3 `configResolved` 钩子

```typescript
configResolved(config) {
  needHmr =
    config.command === 'serve' &&
    config.mode !== 'production' &&
    options.hot !== false
}
```

##### 1.3.4 `resolveId/load` 钩子

```typescript
resolveId(id) {
  if (id === runtimePublicPath) return id
}

load(id) {
  if (id === runtimePublicPath) return runtimeCode
}
```

##### 1.3.5 `transform` 钩子增强

```typescript
async transform(source, id, transformOptions) {
  const isSsr = transformOptions && transformOptions.ssr
  const currentFileExtension = getExtension(id)

  if (!filter(id)) return null

  // 处理文件扩展名
  if (
    !(
      /\.[cm]?[tj]sx$/i.test(id) ||
      allExtensions.includes(currentFileExtension)
    )
  ) {
    return null
  }

  // 确定编译选项
  let zeusOptions: CompilerOptions

  if (options.ssr) {
    if (isSsr) {
      zeusOptions = { generate: 'ssr', hydratable: true, ...options.zeus }
    } else {
      zeusOptions = { generate: 'dom', hydratable: true, ...options.zeus }
    }
  } else {
    zeusOptions = { generate: 'dom', hydratable: false, ...options.zeus }
  }

  // Babel 配置合并
  let babelUserOptions: babel.TransformOptions = {}

  if (options.babel) {
    if (typeof options.babel === 'function') {
      const babelOptions = options.babel(source, id, isSsr)
      babelUserOptions = babelOptions instanceof Promise ? await babelOptions : babelOptions
    } else {
      babelUserOptions = options.babel
    }
  }

  const result = transformSync({
    code: source,
    filename: id,
    options: zeusOptions,
  })

  return {
    code: result.code,
    map: result.map,
  }
}
```

##### 1.3.6 `handleHotUpdate` 钩子

```typescript
handleHotUpdate() {
  // TODO: 完善依赖图后实现细粒度 HMR
}
```

#### 1.4 运行时模块

创建一个类似 `solid-refresh` 的 HMR runtime，注入到 `/@zeus-refresh` 路径。后续根据 Zeus 框架的实际 HMR API 设计具体实现。

### 2. rollup-plugin-zeus 完善内容

#### 2.1 Options 接口增强

```typescript
export interface ZeusRollupPluginOptions {
  // 文件过滤
  include?: RegExp
  exclude?: RegExp

  // 模式控制
  ssr?: boolean
  generate?: 'dom' | 'ssr' | 'universal'

  // Babel 配置
  babel?: babel.TransformOptions

  // 编译器配置
  options?: CompilerOptions
}
```

#### 2.2 新增配置项说明

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `include` | `RegExp` | `/\.[jt]sx?$/` | 插件处理的文件匹配模式 |
| `exclude` | `RegExp` | `/node_modules/` | 插件排除的文件匹配模式 |
| `ssr` | `boolean` | `false` | 是否启用 SSR 模式 |
| `generate` | `'dom' \| 'ssr' \| 'universal'` | `'dom'` | 输出模式 |
| `babel` | `TransformOptions` | `{}` | 自定义 Babel 配置 |
| `options` | `CompilerOptions` | `{}` | 编译器配置 |

#### 2.3 新增 Rollup 钩子

##### 2.3.1 `buildStart` 钩子

```typescript
buildStart() {
  // 初始化插件状态
  // 可以在此进行构建前的检查和配置
}
```

##### 2.3.2 `renderStart` 钩子

```typescript
renderStart(outputOptions) {
  // 记录构建信息
}
```

### 3. Babel 配置合并策略

使用 `merge-anything` 库进行配置合并（如 `vite-plugin-solid`），确保用户配置与默认配置正确合并。

合并优先级：
1. 用户配置优先
2. 保留必要的插件配置

### 4. 文件扩展名处理

- 默认处理：`/\.[cm]?[tj]sx?$/i`
- 通过 `extensions` 选项扩展可处理的文件类型
- `.tsx` 文件自动启用 TypeScript parser

### 5. SourceMap 处理

- 默认启用 sourceMaps
- 从编译器返回的 map 直接使用
- 如果 map 为 null，则返回 undefined

## 兼容性考虑

### Vite 版本兼容性

| 特性 | Vite 6 | Vite 7 | Vite 8 |
|------|--------|--------|--------|
| `config` 钩子 | ✅ | ✅ | ✅ |
| `configEnvironment` 钩子 | ✅ | ✅ | ✅ |
| `resolve.conditions` | 默认值 | 默认值 | 需要显式设置 |
| Rolldown 优化 | ❌ | ❌ | ✅ |

### 版本检测逻辑

```typescript
import { version } from 'vite'

const viteVersionMajor = +version.split('.')[0]
const isVite6 = viteVersionMajor >= 6
const isVite8 = viteVersionMajor >= 8
```

## 依赖更新

### vite-plugin-zeus 需新增依赖

```json
{
  "dependencies": {
    "@zeus-js/compiler": "workspace:*",
    "merge-anything": "^4.x"
  },
  "peerDependencies": {
    "vite": "^6.0.0 || ^7.0.0 || ^8.0.0"
  }
}
```

## 后续工作

1. **HMR Runtime 实现**：根据 Zeus 框架的实际 HMR API 设计具体的运行时模块
2. **依赖图完善**：完善编译器依赖图以支持细粒度 HMR
3. **测试用例**：编写完整的单元测试和 E2E 测试
4. **文档完善**：提供使用示例和配置说明
