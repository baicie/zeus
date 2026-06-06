# Packages 集合分类设计

本文讨论 `packages/` 子包数量较多时的集合化分类方式。目标是先建立稳定的包集合模型，降低理解、维护、发布和文档成本；不在第一步强行合并包或重排目录。

## 背景

当前 `packages/` 下共有 19 个子包：

- `packages/core/*`：5 个
- `packages/devtools/*`：2 个
- `packages/web-c/*`：10 个
- `packages/create/*`：2 个

现有分组已经能表达大方向，但 `web-c` 内部包数量较多，`devtools` 与 `create` 也存在职责命名交叉。对新贡献者而言，理解 Zeus 的包结构需要同时回答三个问题：

- 哪些包是用户直接安装的公共入口？
- 哪些包只是编译器、输出插件或 CLI 的内部实现模块？
- 哪些包属于 Zeus 框架本体，哪些属于 Web Components 组件库输出链路？

因此需要引入“集合”概念，用于描述包的产品职责和演进边界。

## 目标

- 用少量集合解释所有子包。
- 明确每个集合的公共入口、内部模块和发布边界。
- 保留细粒度 package 的可测试性、可发布性和 tree-shaking 能力。
- 为后续目录重排、发布策略、文档导航和 CI 分组提供依据。
- 避免把 Zeus 核心框架与 Web Components 组件库工具链混为一个概念。

## 非目标

- 本文不直接要求删除或合并 npm 包。
- 本文不改变任何现有 `package.json` 的 `name`、`exports` 或版本策略。
- 本文不把 `@zeus-js/zeus` 扩大成所有工具链能力的巨型入口。
- 本文不改变 Zeus “编译器优先、细粒度响应式、直接 DOM 更新”的架构方向。

## 设计原则

### 1. 集合是认知边界，不一定是发布边界

一个集合可以包含多个 npm 包。集合用于组织文档、CI、维护职责和路线图；npm 包仍按稳定公共接口单独发布。

### 2. 用户入口少，内部模块清晰

每个集合应尽量只有 1 到 2 个推荐用户入口。其余包要标注为内部实现、插件扩展或高级入口。

### 3. 核心框架与组件库输出链路分离

Zeus 核心框架面向应用运行与 JSX 编译；Web Components 输出链路面向组件库构建、manifest、DTS、wrapper 和资源产物。两者可以共享编译器和 runtime，但不应在产品命名上互相吞并。

### 4. 不为了减少目录数牺牲模块深度

如果一个包拥有独立的公共接口、测试面和发布价值，应保留独立包。集合化优先解决“怎么理解”和“怎么维护”，而不是机械减少目录。

## 推荐集合

### A. Framework 集合

Framework 集合代表 Zeus 框架本体，服务于应用开发与运行时语义。

| 包                     | 路径                        | 定位                                                            |
| ---------------------- | --------------------------- | --------------------------------------------------------------- |
| `@zeus-js/zeus`        | `packages/core/zeus`        | 用户主入口，导出公共 API、JSX runtime、advanced 和 capabilities |
| `@zeus-js/signal`      | `packages/core/signal`      | 响应式核心，封装内部 signal 引擎                                |
| `@zeus-js/runtime-dom` | `packages/core/runtime-dom` | DOM runtime helpers                                             |
| `@zeus-js/shared`      | `packages/core/shared`      | 框架内部共享工具                                                |

推荐用户入口：

- `@zeus-js/zeus`

高级或内部入口：

- `@zeus-js/signal`：高级用户或内部包使用。
- `@zeus-js/runtime-dom`：编译器生成代码或高级集成使用。
- `@zeus-js/shared`：不推荐用户直接依赖。

设计约束：

- `@zeus-js/zeus` 是对外稳定门面，但不能暴露 `alien-signals` 细节。
- `@zeus-js/signal` 必须保持无 DOM 依赖。
- `@zeus-js/runtime-dom` 不承载编译器高层语义，只提供模板、绑定、事件、控制流区域和清理 hooks。

### B. Compiler 集合

Compiler 集合代表 Zeus JSX/TSX 编译链路，服务于编译期 DOM 生成。

| 包                     | 路径                            | 定位                     |
| ---------------------- | ------------------------------- | ------------------------ |
| `@zeus-js/compiler`    | `packages/core/compiler`        | Babel JSX 编译器插件     |
| `@zeus-js/vite-plugin` | `packages/devtools/vite-plugin` | 面向应用开发的 Vite 集成 |

推荐用户入口：

- `@zeus-js/vite-plugin`

高级或内部入口：

- `@zeus-js/compiler`：Vite 插件、bundler 插件或测试直接使用。

设计约束：

- 编译器必须继续向 Zeus IR 演进，不能长期把 Babel AST 当作内部协议。
- Vite 插件是集成层，不应承担 DOM runtime 或 Web Components 输出插件职责。
- 编译结果应保持直接 DOM 操作，不引入 VNode diff。

### C. Component Host 集合

Component Host 集合代表 Web Components 组件库构建宿主。它负责组件分析、bundler adapter、manifest、DTS 和多目标输出调度。

| 包                            | 路径                                | 定位                                                  |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------- |
| `@zeus-js/bundler-plugin`     | `packages/web-c/bundler-plugin`     | 组件库构建宿主，提供 Rollup / Rolldown / Vite adapter |
| `@zeus-js/component-analyzer` | `packages/web-c/component-analyzer` | 组件分析与 manifest 输入模型                          |
| `@zeus-js/component-dts`      | `packages/web-c/component-dts`      | 组件类型声明生成                                      |
| `@zeus-js/web-c`              | `packages/web-c/web-c`              | 聚合入口与常用输出预设                                |

推荐用户入口：

- `@zeus-js/bundler-plugin`
- `@zeus-js/web-c`

高级或内部入口：

- `@zeus-js/component-analyzer`
- `@zeus-js/component-dts`

设计约束：

- `@zeus-js/bundler-plugin` 是组件库构建的宿主，不是普通应用开发的唯一入口。
- analyzer 和 dts 可以独立测试、独立复用，因此暂不合并。
- `componentLibrary()` 只做组合，不应隐藏各 output plugin 的核心语义。

### D. Component Outputs 集合

Component Outputs 集合代表组件库的产物输出插件。

| 包                              | 路径                                  | 定位                |
| ------------------------------- | ------------------------------------- | ------------------- |
| `@zeus-js/output-wc`            | `packages/web-c/output-wc`            | Web Components 输出 |
| `@zeus-js/output-react-wrapper` | `packages/web-c/output-react-wrapper` | React wrapper 输出  |
| `@zeus-js/output-vue-wrapper`   | `packages/web-c/output-vue-wrapper`   | Vue wrapper 输出    |
| `@zeus-js/output-icons`         | `packages/web-c/output-icons`         | 图标输出            |
| `@zeus-js/output-css`           | `packages/web-c/output-css`           | CSS 资源输出        |

推荐用户入口：

- 通过 `@zeus-js/web-c` 间接使用。
- 需要精细控制时直接安装单个 output 包。

设计约束：

- 每个 output plugin 代表一个清晰产物目标，应保留独立包。
- wrapper 输出不能反向污染 Zeus runtime 语义。
- CSS、icons 等资源输出属于组件库构建链路，不属于框架核心。

### E. Web Component Runtime 集合

Web Component Runtime 集合代表 custom element 生命周期、属性反射和投影语义所需的运行时桥接。

| 包                       | 路径                           | 定位                          |
| ------------------------ | ------------------------------ | ----------------------------- |
| `@zeus-js/web-c-runtime` | `packages/web-c/web-c-runtime` | Web Components runtime bridge |

推荐用户入口：

- 通常不直接安装，由 `@zeus-js/output-wc` 或生成代码依赖。

设计约束：

- 生命周期清理必须与 Zeus owner / scope / disposal 打通。
- Shadow DOM 与 Light DOM 投影语义不能混淆。
- Light DOM slot 投影是 Zeus 自己管理的语义，不是原生 `<slot>` 行为。

### F. Create & Registry 集合

Create & Registry 集合代表项目初始化、UI 组件注册表和 copyable 组件安装能力。

| 包                  | 路径                            | 定位              |
| ------------------- | ------------------------------- | ----------------- |
| `create-zeus`       | `packages/devtools/create-zeus` | Zeus 项目脚手架   |
| `zeus-ui`           | `packages/create/zeus-ui`       | UI 组件安装 CLI   |
| `@zeus-ui/registry` | `packages/create/registry`      | UI 组件源码注册表 |

推荐用户入口：

- `create-zeus`
- `zeus-ui`

高级或内部入口：

- `@zeus-ui/registry`

设计约束：

- `create-zeus` 负责项目模板，不负责组件注册表写入用户项目的细节。
- `zeus-ui` 负责 registry 查询、组件复制和依赖安装。
- registry 是数据与源码集合，不应承担 CLI 流程逻辑。

## 集合总览

| 集合                  | 主要用户             | 推荐入口                                    | 包数量 | 说明                          |
| --------------------- | -------------------- | ------------------------------------------- | -----: | ----------------------------- |
| Framework             | 应用开发者           | `@zeus-js/zeus`                             |      4 | Zeus 运行时和公共 API         |
| Compiler              | 应用开发者、插件作者 | `@zeus-js/vite-plugin`                      |      2 | JSX/TSX 编译与应用集成        |
| Component Host        | 组件库作者           | `@zeus-js/bundler-plugin`、`@zeus-js/web-c` |      4 | 组件库构建宿主                |
| Component Outputs     | 组件库作者           | output 插件或 `@zeus-js/web-c`              |      5 | 多目标产物输出                |
| Web Component Runtime | 生成代码、内部包     | `@zeus-js/web-c-runtime`                    |      1 | custom element runtime bridge |
| Create & Registry     | 新项目用户、UI 用户  | `create-zeus`、`zeus-ui`                    |      3 | 脚手架与 UI registry          |

## 可选目录重排方案

第一阶段只建议更新文档和导航，不移动目录。若后续确实需要让目录与集合完全一致，可以考虑以下结构：

```text
packages/
  framework/
    zeus/
    signal/
    runtime-dom/
    shared/
  compiler/
    compiler/
    vite-plugin/
  component-host/
    bundler-plugin/
    component-analyzer/
    component-dts/
    web-c/
  component-outputs/
    output-wc/
    output-react-wrapper/
    output-vue-wrapper/
    output-icons/
    output-css/
  web-component-runtime/
    web-c-runtime/
  create/
    create-zeus/
    zeus-ui/
    registry/
```

但该重排会影响：

- `pnpm-workspace.yaml`
- 构建脚本中的 glob
- release 脚本
- API snapshot 路径
- 文档链接
- examples 与测试中的相对路径

因此目录重排应作为独立迁移 issue，不应和集合设计混在一起完成。

## 推荐的近期落地步骤

### 阶段 1：文档集合化

- 在 `docs/api/packages.md` 中增加“按集合阅读”章节。
- 在 README 或 docs 导航中把包按集合展示。
- 给每个集合标注“推荐用户入口”和“不推荐直接依赖入口”。

验收标准：

- 新贡献者能在 5 分钟内理解 19 个包分别属于哪个集合。
- 用户文档优先推荐少量入口，而不是平铺所有包。

### 阶段 2：CI 与脚本集合化

- 为集合增加 filter 约定，例如：
  - Framework：`@zeus-js/zeus`、`@zeus-js/signal`、`@zeus-js/runtime-dom`、`@zeus-js/shared`
  - Compiler：`@zeus-js/compiler`、`@zeus-js/vite-plugin`
  - Component Host：`@zeus-js/bundler-plugin`、`@zeus-js/component-analyzer`、`@zeus-js/component-dts`、`@zeus-js/web-c`
  - Component Outputs：`@zeus-js/output-*`
  - Create & Registry：`create-zeus`、`zeus-ui`、`@zeus-ui/registry`
- 在 release check 或 package docs 中沿用同一套集合名称。

验收标准：

- 可以按集合运行构建、测试或 API snapshot 检查。
- 集合名称在文档、脚本和 issue 中保持一致。

### 阶段 3：评估目录重排

只有当文档集合化仍不能解决维护成本时，再考虑目录重排。

建议评估条件：

- 新增子包继续集中在 `web-c` 下，导致该目录超过 12 个包。
- CI / release 已经按集合运行，但目录名与集合名长期不一致。
- 文档和 issue 中频繁需要解释 `web-c` 与 `component-host/output/runtime` 的关系。

## 暂不建议合并的包

### 不合并 `@zeus-js/signal` 与 `@zeus-js/runtime-dom`

原因：

- signal 是无 DOM 的语义基础。
- runtime-dom 是 DOM helper 和绑定层。
- 合并会削弱响应式核心的独立测试面，也会让 Web Components runtime 更难只依赖需要的部分。

### 不合并 `component-analyzer` 与 `component-dts`

原因：

- analyzer 负责提取组件元数据。
- dts 负责把元数据输出为类型声明。
- 两者是不同产物阶段，分开能保持测试局部性。

### 不合并所有 `output-*`

原因：

- 每个 output plugin 的 peer dependencies 不同。
- React、Vue、CSS、icons 和 WC 产物目标不同。
- 合并会增加用户安装成本，也会让 peer dependency 更混乱。

### 不把 `create-zeus` 合并进 `zeus-ui`

原因：

- `create-zeus` 是项目脚手架。
- `zeus-ui` 是组件复制与 registry CLI。
- 两者用户旅程有关联，但职责不同。

## 命名建议

后续文档、issue 和 release notes 中统一使用以下集合名称：

- Framework
- Compiler
- Component Host
- Component Outputs
- Web Component Runtime
- Create & Registry

中文说明中可以写作：

- 框架本体
- 编译链路
- 组件构建宿主
- 组件产物输出
- Web Components 运行时桥接
- 脚手架与注册表

## 结论

当前不建议通过直接合并 package 来解决“子包太多”的问题。更稳妥的方案是先引入集合分类：用 6 个集合解释 19 个子包，同时明确推荐入口、内部模块和迁移阶段。

这能在不破坏现有包名、发布边界和测试面的前提下，降低项目认知成本，并为后续目录重排或发布策略调整留下空间。
