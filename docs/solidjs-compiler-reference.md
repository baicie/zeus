# SolidJS 编译器参考路径

## 概览

SolidJS 的编译体系分为两部分：
1. **dom-expressions** (`vendor/dom-expressions`) — JSX → 编译产物
2. **solid** (`vendor/solid`) — 运行时（响应式、渲染）

## Babel JSX 编译器核心

```
vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions/src/
```

### 核心文件

| 文件 | 作用 |
|------|------|
| `index.ts` | Babel 插件入口，配置模块名、内置组件、生成目标 |
| `config.ts` | 编译配置解析 |

### DOM codegen（你要重点看的）

```
vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions/src/dom/
```

| 文件 | 作用 |
|------|------|
| `constants.js` | DOM 常量（自闭合标签、布尔属性等） |
| `element.js` | DOM 元素编译：attribute / property / event / style / class 处理 |
| `template.js` | 模板生成：静态 HTML 提取、动态锚点、克隆逻辑 |

### 共享转换逻辑

```
vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions/src/shared/
```

| 文件 | 作用 |
|------|------|
| `component.js` | 组件识别、props 传递、children 处理 |
| `fragment.js` | Fragment 处理 |
| `transform.js` | JSX 节点遍历与转换主流程 |
| `preprocess.js` | 预处理：展开 spreading、析构 props |
| `postprocess.js` | 后处理：死代码消除、变量提升 |
| `utils.js` | 工具函数 |
| `validate.js` | 校验：无效用法警告 |
| `universal/` | 跨平台共享逻辑 |

### SSR 编译（参考）

```
vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions/src/ssr/
```

### 测试用例

```
vendor/dom-expressions/packages/babel-plugin-jsx-dom-expressions/test/
```

## SolidJS 运行时

```
vendor/solid/packages/solid/src/
```

| 目录/文件 | 作用 |
|----------|------|
| `index.ts` | 主入口导出 |
| `reactive/signal.ts` | createSignal 实现 |
| `reactive/scheduler.ts` | 调度器 |
| `reactive/array.ts` | 数组响应式处理 |
| `render/index.ts` | 渲染入口 |
| `render/component.ts` | 组件渲染 |
| `render/flow.ts` | Show / For / Switch / Match 等控制流 |
| `render/Suspense.ts` | Suspense 实现 |

## Babel 预设入口

```
vendor/solid/packages/babel-preset-solid/index.js
```

这个 preset 引用了 `babel-plugin-jsx-dom-expressions`，配置了：
- `moduleName: "solid-js/web"` — 编译产物导入 solid-js/web
- `builtIns` — 内置组件列表（For, Show, Switch, Match, Portal, Suspense...）
- `generate: "dom"` — 生成 DOM 代码

## 编译产物示例（参考）

当编译这个 JSX：

```tsx
function Counter() {
  const [count, setCount] = createSignal(0)
  return <button onClick={() => setCount(c => c + 1)}>{count()}</button>
}
```

它会被编译为大约等价于：

```js
import { createTemplate as _createTemplate, createText as _createText,
         template as _$template, mergeProps } from "solid-js/web";

const _tmpl = _createTemplate('<button>');

function Counter() {
  const _props = mergeProps();
  const _el$ = _$template(_tmpl).cloneNode(true);
  const _ref$ = _el$.firstChild;
  _ref$.addEventListener("click", () => setCount(c => c + 1));
  const _t$ = _createText();
  _ref$.appendChild(_t$);
  _$createEffect(() => _t$.data = count());
  return _ref$;
}
```

## 重点阅读顺序建议

1. **先看 transform.js** — 理解 JSX 如何被遍历和转换
2. **再看 element.js** — 理解每种 DOM 绑定（attr/prop/event/text/class/style）如何生成
3. **看 template.js** — 理解静态模板提取和动态锚点机制
4. **看 component.js** — 理解组件边界、props 传递
5. **看 fragment.js + flow.ts** — 理解 Fragment、Show、For
6. **回看 runtime-dom** — 对齐你的 `runtime-dom/` helpers
