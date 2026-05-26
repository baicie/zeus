# Phase 0：项目基线与框架定位

> 状态：Phase 0 核心已完成
> 说明：本文档记录 Phase 0 的详细讨论过程。框架定位与构建决策见 [`roadmap.md`](../roadmap.md)。

## 目标

Phase 0 的目标是：

```txt
把 Zeus 从“响应式实验仓库”整理成“可持续演进的框架 monorepo”。
```

当前仓库已经是 pnpm monorepo，包含 `packages/*` 和 `playground/*`，但 README 仍然把项目描述成“轻量级响应式信号系统”，和你现在要做的 compiler-first 框架方向不完全一致。

---

# Phase 0 要解决的问题

## 1. 明确 Zeus 定位

最终定位建议改成：

```txt
Zeus 是一个 compiler-first、无 Virtual DOM、基于细粒度响应式的前端 UI 框架。
```

核心特征：

```txt
1. 使用 state() 作为统一状态入口
2. 保留 Vue-like 引用类型响应式能力
3. JSX 编译为直接 DOM 操作
4. runtime 通过 effect 精准更新 DOM
5. 后续支持 Host / Slot / Web Components
```

不再把项目只定位成：

```txt
轻量级响应式信号系统
```

这个描述太窄了。

---

## 2. 确定包结构

Phase 0 最终包结构建议：

```txt
packages/
  shared/          # 公共工具函数
  signal/          # 响应式核心，Phase 1 重点
  runtime-dom/     # DOM runtime
  compiler/        # JSX compiler
  zeus/            # 后续框架统一入口，可 Phase 4 再建
  vite-plugin/     # 后续 Vite 插件，可 Phase 4 再建

playground/
  zeus-app/        # Zeus playground
```

当前已经有：

```txt
@zeus-js/signal
@zeus-js/shared
@zeus-js/compiler
@zeus-js/runtime-dom
```

其中 `signal` 已经有完整 buildOptions，`compiler` 也有 buildOptions，但 `runtime-dom` 当前是独立 tsup scripts 风格，和 root build 体系不一致。

---

## 3. 统一构建体系

当前 root `build.ts` 会扫描 `packages` 下有 `package.json` 且有 `buildOptions` 的包作为 target。

所以 Phase 0 要么：

```txt
方案 A：runtime-dom 也接入 buildOptions
方案 B：root build 兼容 package scripts build
```

我建议选 **方案 A**。

也就是给 `packages/runtime-dom/package.json` 增加：

```json
{
  "buildOptions": {
    "name": "ZeusRuntimeDOM",
    "formats": ["esm-bundler", "esm-browser", "cjs", "global"]
  }
}
```

这样 root：

```bash
pnpm build
```

可以统一构建：

```txt
shared
signal
compiler
runtime-dom
```

---

## 4. 统一脚本

当前 root 已经有：

```json
{
  "scripts": {
    "dev": "tsx scripts/build.ts --watch",
    "build": "tsx scripts/build.ts",
    "build-dts": "tsc -p tsconfig.build.json --noCheck && rolldown -c ./scripts/rolldown.dts.config.ts",
    "check": "tsc --incremental --noEmit",
    "lint": "eslint --cache .",
    "test": "vitest",
    "test-unit": "vitest --project 'unit*'",
    "test-coverage": "vitest run --project unit* --coverage"
  }
}
```

这个基础可以保留。

Phase 0 只需要明确：

```txt
pnpm build      # 构建所有核心包
pnpm check      # 类型检查
pnpm test       # 所有测试
pnpm lint       # 代码检查
pnpm dev        # watch build
```

---

# Phase 0 详细任务

## Phase 0.1：更新 README 定位

把 README 改成：

````md
# Zeus

Zeus is a compiler-first, fine-grained reactive UI framework.

## Goals

- No Virtual DOM
- JSX-first developer experience
- Fine-grained DOM updates
- Unified state API with `state()`
- Vue-like object reactivity
- Compiler-generated DOM operations
- Web Components support in future phases

## Packages

- `@zeus-js/shared`
- `@zeus-js/signal`
- `@zeus-js/runtime-dom`
- `@zeus-js/compiler`

## Development

```bash
pnpm install
pnpm build
pnpm check
pnpm test
```
````

````

中文也可以：

```md
# Zeus

Zeus 是一个 compiler-first、基于细粒度响应式、无 Virtual DOM 的前端 UI 框架。

核心目标：

- JSX 开发体验
- 编译期模板提升
- 运行时细粒度 DOM 更新
- `state()` 统一状态入口
- 保留对象、数组、Map、Set 的引用类型响应式能力
````

---

## Phase 0.2：确定 public API 命名策略

Phase 0 必须先定命名，否则 Phase 1 会乱。

最终结论建议写入 `docs/rfc/0001-reactivity-api.md`：

```txt
主 API：
  state()
  computed()
  effect()
  watch()
  scope()

不主推：
  ref()
  reactive()
  cell()
  domRef()
  useState()

JSX ref：
  只作为 JSX 属性协议存在：<input ref={input} />
```

也就是：

```tsx
const input = state<HTMLInputElement | null>(null)

return <input ref={input} />
```

不要额外提供：

```ts
domRef()
```

---

## Phase 0.3：统一包导出规范

所有核心包 package.json 建议统一：

```json
{
  "name": "@zeus-js/xxx",
  "version": "0.0.1",
  "type": "module",
  "main": "index.js",
  "module": "dist/xxx.esm-bundler.js",
  "types": "dist/xxx.d.ts",
  "files": ["index.js", "dist"],
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/xxx.d.ts",
      "node": {
        "production": "./dist/xxx.cjs.prod.js",
        "development": "./dist/xxx.cjs.js",
        "default": "./index.js"
      },
      "module": "./dist/xxx.esm-bundler.js",
      "import": "./dist/xxx.esm-bundler.js",
      "require": "./index.js"
    }
  }
}
```

`signal` 和 `compiler` 已经大体是这个模式。

Phase 0 要让 `runtime-dom` 也对齐。

---

## Phase 0.4：整理测试结构

当前 Vitest 会扫描：

```txt
packages/**/*.{test,spec}.{ts,tsx}
```

这个设计可以保留。

建议规范成：

```txt
packages/signal/__tests__/
  state.spec.ts
  effect.spec.ts
  computed.spec.ts
  watch.spec.ts
  scope.spec.ts

packages/runtime-dom/__tests__/
  render.spec.ts
  binding.spec.ts
  ref.spec.ts

packages/compiler/__tests__/
  jsx.spec.ts
  ref.spec.ts
  builtin.spec.ts
```

Phase 0 不要求把测试全写完，但要把目录和命名规范定好。

---

## Phase 0.5：新增 docs/rfc 目录

建议新增：

```txt
docs/
  roadmap.md
  architecture.md
  rfc/
    0001-reactivity-api.md
    0002-jsx-ref.md
    0003-compiler-ir.md
```

Phase 0 至少写：

```txt
docs/roadmap.md
docs/rfc/0001-reactivity-api.md
```

---

# Phase 0 交付物

Phase 0 完成时，应该有这些东西：

```txt
1. README 定位更新
2. docs/roadmap.md
3. docs/rfc/0001-reactivity-api.md
4. runtime-dom 接入统一 buildOptions
5. root pnpm build 能构建 shared/signal/compiler/runtime-dom
6. root pnpm check 通过
7. root pnpm test 通过
8. 明确 Phase 1 的 API 方向：state() 统一状态入口
```

---

# Phase 0 验收标准

执行：

```bash
pnpm install
pnpm build
pnpm check
pnpm test
```

都通过。

并且文档里明确写清楚：

```txt
Zeus 的状态 API 是 state()
DOM ref 是 JSX ref={} 协议
ref()/reactive() 是底层兼容 API，不作为主文档推荐
```

---

# Phase 0 和 Phase 1 的关系

Phase 0 是定规则：

```txt
项目定位、包结构、构建、命名、文档、测试基线
```

Phase 1 是正式实现：

```txt
state()
scope()
JSX ref runtime/compiler 支持
响应式测试补齐
```

所以整体路线应该是：

```txt
Phase 0：项目基线与 API 决策
Phase 1：Unified State API + Reactivity Core
Phase 2：Runtime DOM MVP
Phase 3：Compiler MVP 闭环
Phase 4：Vite 插件与框架入口
Phase 5：Host / Slot / Web Components
Phase 6：性能优化
Phase 7：文档、生态、发布
```

Phase 0 很小，但不能跳。因为你现在已经在纠结 `ref/reactive/state/domRef` 这些命名，说明 API 决策必须先落文档。
