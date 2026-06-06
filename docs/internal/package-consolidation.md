# Zeus Package Consolidation

本文记录当前包边界、推荐用户入口和后续整理策略。Zeus 处于 beta 阶段且无真实用户迁移压力，因此包入口收敛时直接采用当前认可设计，不保留旧 facade 或迁移窗口。

## 当前结论

1. 用户文档只推荐少数入口。
2. 产物插件、analyzer、d.ts 生成器、lazy runtime 保持独立包，以保留清晰测试面和 peer dependency 边界。
3. `componentLibrary()` 已归入 `@zeus-js/web-c`，不再保留单独 preset facade。
4. `@zeus-js/shared` 仍是 workspace package，但应视为 internal-only，不推荐用户直接依赖。
5. React/Vue wrapper 不合并公开包名；如需要，后续只抽内部共享 helper。

## 推荐用户入口

| 包                     | 角色                                                            |
| ---------------------- | --------------------------------------------------------------- |
| `@zeus-js/zeus`        | 框架主入口：响应式、DOM runtime、JSX runtime、`defineElement`。 |
| `@zeus-js/vite-plugin` | 普通 Zeus 应用的 Vite 集成入口。                                |
| `@zeus-js/web-c`       | 组件库构建工具链聚合入口。                                      |
| `create-zeus`          | 新项目脚手架 CLI。                                              |
| `zeus-ui`              | 给已有项目添加 copyable UI 组件的 CLI。                         |

## 保留的高级/内部包

这些包可被内部构建链或高级用户直接消费，但不作为普通用户入门安装入口。

| 包                              | 保留原因                                             |
| ------------------------------- | ---------------------------------------------------- |
| `@zeus-js/signal`               | 无 DOM 响应式核心，语义基础独立。                    |
| `@zeus-js/runtime-dom`          | 编译产物与 Web Component runtime 直接依赖。          |
| `@zeus-js/compiler`             | Babel 编译器实现，供 Vite 与 Web-C bundler 复用。    |
| `@zeus-js/bundler-plugin`       | Rollup/Rolldown/Vite 组件构建宿主。                  |
| `@zeus-js/component-analyzer`   | 源码到 `ComponentManifest` 的唯一分析阶段。          |
| `@zeus-js/component-dts`        | `ComponentManifest` 到 `.d.ts` 的独立产物阶段。      |
| `@zeus-js/web-c-runtime`        | lazy custom element 运行时，属于生成产物依赖。       |
| `@zeus-js/output-wc`            | Web Component lazy / side-effect 产物目标。          |
| `@zeus-js/output-react-wrapper` | React wrapper 产物目标，隔离 React peer dependency。 |
| `@zeus-js/output-vue-wrapper`   | Vue wrapper 产物目标，隔离 Vue peer dependency。     |
| `@zeus-js/output-css`           | CSS asset output。                                   |
| `@zeus-js/output-icons`         | icon asset output。                                  |
| `@zeus-ui/registry`             | CLI 数据源和 copyable source registry。              |

## 当前 Web-C 聚合入口

组件库作者推荐使用：

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/rolldown'

export default zeus({
  components: {
    include: ['src/**/*.tsx'],
  },
  plugins: componentLibrary({
    targets: ['wc', 'react', 'vue'],
    register: 'lazy',
    wrapper: 'event-bridge',
  }),
})
```

`componentLibrary()` 组合：

- `@zeus-js/output-css`
- `@zeus-js/output-wc`
- `@zeus-js/output-react-wrapper`
- `@zeus-js/output-vue-wrapper`

这已经是唯一推荐 preset 写法；不要恢复 `@zeus-js/preset-component-library`。

## 不合并的包

### 不合并 `@zeus-js/output-react-wrapper` 和 `@zeus-js/output-vue-wrapper`

二者都生成 framework wrapper，但公开包不合并：

- peer dependency 不同。
- 类型模型不同。
- React ref/event bridge 与 Vue emits/v-model 语义不同。
- 用户常常只需要其中一个目标。

可接受的后续整理：抽内部 shared helper，但不要增加新的公开 facade。

### 不合并 `@zeus-js/component-analyzer` 和 `@zeus-js/component-dts`

它们是两个阶段：

- analyzer：源码 -> `ComponentManifest`
- dts：`ComponentManifest` -> 声明文件

manifest 还会被 docs、registry、AI metadata、`custom-elements.json` 消费。合并会让 d.ts 生成逻辑反向污染分析层。

### 不合并 `@zeus-js/vite-plugin` 和 `@zeus-js/web-c`

用户旅程不同：

- `@zeus-js/vite-plugin` 面向普通 Zeus 应用。
- `@zeus-js/web-c` 面向组件库构建和多目标输出。

普通应用不应被迫理解 Web-C output target。

### 不合并 `create-zeus` 和 `zeus-ui`

二者都是 CLI，但职责不同：

- `create-zeus` 创建新项目。
- `zeus-ui` 给已有项目添加 registry 组件。

可以共享 prompts、package manager 检测、文件写入工具，但不合并命令。

## 后续整理路线

### P1：文档入口收敛

- 用户文档只推荐五个入口。
- 所有 Web-C 示例统一从 `@zeus-js/web-c` 导入。
- `docs/internal/README.md` 明确当前权威文档和历史设计文档。

### P2：internal-only 包治理

- 从用户文档中移除 `@zeus-js/shared`。
- 评估是否把 `@zeus-js/shared` 移为内部源码模块。
- 保证 `@zeus-js/compiler` 与 `@zeus-js/signal` 构建不受影响。

### P3：内部重复 helper 抽取

- React/Vue wrapper 的命名、事件、props helper 可抽内部共享模块。
- 不新增用户可见入口。

## 不建议做的事

- 不把所有 Web-C 包合成一个巨包。
- 不把 `runtime-dom` 合进 `zeus`。
- 不把 `signal` 合进 `runtime-dom`。
- 不为了减少目录数做大规模目录重排。

当前最优方向是：公开入口少、内部阶段清晰、产物插件独立、manifest 作为所有 output target 的共同协议。
