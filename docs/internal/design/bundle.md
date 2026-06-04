# Bundler Plugin Design

本文记录 `@zeus-js/bundler-plugin` 当前的 Rollup、Rolldown 与 Vite 集成设计。

Zeus 的 bundler 集成目标是让用户在基础组件库场景中直接使用 `zeus()` 起步，不需要先理解 JSX preserve、TypeScript strip、runtime helper import、component manifest、virtual module 与 wrapper output 的内部细节。

## 目标

- Rollup 默认可处理 `.ts` / `.tsx` 组件和普通 TS 依赖。
- Rolldown 与 Vite 默认交给各自 bundler 处理 TS 转译，只负责 Zeus JSX 编译和组件插件调度。
- 三个 adapter 共享组件扫描、manifest、diagnostics、virtual modules、output plugin 调度等核心逻辑。
- `defineZeusRollupConfig()` 与 `defineZeusRolldownConfig()` 提供低心智默认配置。
- component plugin 可以声明 framework external，由 Vite adapter 和 Rollup/Rolldown config helper 自动合并。

## 非目标

- 不把 Rollup adapter 变成通用 TypeScript 构建系统。
- 不默认替用户处理所有第三方依赖解析策略。
- 不在 bundler plugin 中引入 Virtual DOM 或运行时 JSX 解释层。
- 不让 Rolldown/Vite 默认额外跑 Babel TS strip，避免和 bundler 内建 transform 重复。

## 用户 API

Rollup：

```ts
import zeus from '@zeus-js/bundler-plugin/rollup'

export default {
  input: 'src/index.ts',
  plugins: [zeus()],
  output: {
    dir: 'dist',
    format: 'es',
  },
}
```

或使用 helper：

```ts
import { defineZeusRollupConfig } from '@zeus-js/bundler-plugin/rollup'

export default defineZeusRollupConfig()
```

Rolldown：

```ts
import { defineZeusRolldownConfig } from '@zeus-js/bundler-plugin/rolldown'

export default defineZeusRolldownConfig()
```

Vite：

```ts
import zeus from '@zeus-js/bundler-plugin/vite'

export default {
  plugins: [zeus()],
}
```

## Adapter 默认行为

| Adapter  | Zeus JSX 编译 | Babel TS strip 默认值 | TS 后续处理                 |
| -------- | ------------- | --------------------- | --------------------------- |
| Rollup   | 是            | `true`                | Zeus 插件负责 strip TS      |
| Rolldown | 是            | `false`               | Rolldown internal transform |
| Vite     | 是            | `false`               | Vite esbuild/Oxc pipeline   |

`transpile` 是通用显式开关：

```ts
zeus({ transpile: true })
```

当用户显式设置 `transpile: true` 时，Rollup、Rolldown 和 Vite adapter 都会对 TS-like 文件运行 Babel TypeScript preset。未设置时，默认值由 adapter 决定：Rollup 为 `true`，Rolldown/Vite 为 `false`。

Babel TypeScript preset 使用默认的类型导入移除行为，不启用 `onlyRemoveTypeImports: true`。这样普通的类型导入也能被擦除：

```ts
import { ButtonProps } from './types'
```

## Rollup Resolve 行为

Rollup adapter 会为相对路径和绝对路径补充 TS-like extensionless 解析。默认扩展名：

```ts
;['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']
```

用户可以覆盖：

```ts
zeus({
  resolveExtensions: ['.ts', '.tsx'],
})
```

也可以关闭：

```ts
zeus({
  resolveExtensions: false,
})
```

该解析只针对 Rollup adapter。Rolldown 和 Vite 使用 bundler 自身的解析能力。

## Component Plugin External

component plugin 可以声明 framework runtime 依赖：

```ts
const reactOutput = {
  name: 'react-output',
  external: ['react'],
}
```

这些 external 会被以下入口使用：

- Vite adapter 的 `config()` hook
- `defineZeusRollupConfig()`
- `defineZeusRolldownConfig()`

合并规则：

- 没有用户 external 时，直接使用 plugin external。
- 用户 external 是字符串、正则或数组时，追加 plugin external。
- 用户 external 是函数时，包装该函数，并优先匹配 plugin external。

直接使用 `rollup({ plugins: [zeus(...)] })` 或 `build({ plugins: [zeus(...)] })` 时，插件不能可靠改写用户顶层 bundler config；因此自动合并只存在于 Vite adapter 和 Rollup/Rolldown config helper 中。

## 公共入口

`@zeus-js/bundler-plugin` 主入口导出 Rollup 默认入口：

```ts
export { default, zeus } from './rollup'
```

独立子入口：

- `@zeus-js/bundler-plugin/vite`
- `@zeus-js/bundler-plugin/rollup`
- `@zeus-js/bundler-plugin/rolldown`
- `@zeus-js/bundler-plugin/manifest`

主入口不 re-export Rolldown，避免主入口类型同时依赖 Rollup 与 Rolldown。

## 已知限制

- Rollup adapter 的 TS strip 只负责移除类型语法，不做完整类型检查。
- Rollup 的 extensionless 解析只处理文件系统中存在的相对/绝对路径。
- Vite/Rolldown 默认不额外 strip TS；如果用户关闭或绕过 bundler 内建 TS transform，需要显式设置 `transpile: true`。
- component plugin external 自动合并只覆盖 Vite adapter 和 `defineZeus*Config()` helper。

## 测试矩阵

- Rollup TSX fixture 使用真实 JSX，并覆盖普通类型 import、runtime helper import、`.mts` / `.cts` extensionless 解析。
- Rolldown TSX fixture 覆盖 Zeus JSX 编译 helper 输出。
- Vite integration 覆盖 plugin config 和 extension option 接收。
- API snapshots 覆盖主入口、Rollup 子入口、Rolldown 子入口和 Vite 子入口的公开类型。
