# Examples

本目录放置 Zeus 的可运行示例与下游消费 fixture。所有示例都应保持 `private: true`，并通过 workspace 依赖消费当前仓库内的包。

## 运行方式

在仓库根目录运行：

```sh
pnpm example:counter
pnpm example:web-component
pnpm example:use-headless-react
```

检查全部示例：

```sh
pnpm examples:check:all
```

如果还没有先构建仓库包，可以运行：

```sh
pnpm examples:check:all --build-first
```

## 基础 Zeus 示例

| 示例            | 说明                                |
| --------------- | ----------------------------------- |
| `counter`       | `createSignal` + `render` 入门示例  |
| `todo`          | 列表、事件与基础状态更新            |
| `context`       | `createContext` / `inject` 依赖注入 |
| `project-board` | 综合 Kanban 示例，覆盖核心交互能力  |

## Web Components 示例

| 示例              | 说明                                             |
| ----------------- | ------------------------------------------------ |
| `web-component`   | `defineElement`、Shadow DOM、`Host`、`Slot` 基线 |
| `light-dom-slots` | Light DOM 投影、默认 slot 与具名 slot            |

## Component Host / Wrapper 示例

| 示例             | 说明                                                 |
| ---------------- | ---------------------------------------------------- |
| `react-wrapper`  | 通过 `zeus:react:*` 虚拟模块消费生成的 React wrapper |
| `vue-wrapper`    | 通过 `zeus:vue:*` 虚拟模块消费生成的 Vue wrapper     |
| `registry-react` | React registry 风格的最终消费形态                    |
| `registry-vue`   | Vue registry 风格的最终消费形态                      |

## Headless Fixture

`headless` 是一个真实组件库 fixture，包名为 `@zeus-ui/headless`。它用于验证 Zeus 输出 Web Components、React wrapper、Vue wrapper 与 registry 消费形态，但不是发布包。

| 示例                 | 说明                                       |
| -------------------- | ------------------------------------------ |
| `headless`           | `@zeus-ui/headless` fixture 源码           |
| `headless-demo`      | Vanilla DOM 中消费 headless Web Components |
| `use-headless-cli`   | 模拟 CLI scaffold 后的消费示例             |
| `use-headless-react` | React 19 中消费 headless 组件              |
| `use-headless-vue`   | Vue 3 中消费 headless 组件                 |

## 维护规则

- 新增示例必须包含 `package.json`、`check` 与 `build` 脚本。
- 示例目录不要提交 `dist`、`node_modules`、`.vite` 等生成产物。
- `@zeus-ui/headless` 作为 fixture 需要先于它的消费者示例构建。
- 面向最终用户的 React / Vue 示例优先使用 registry 消费形态；wrapper 示例保留为 bundler 虚拟模块测试用例。
