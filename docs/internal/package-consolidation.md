# Zeus Package Consolidation Review

本文评估当前 `packages/*` 中哪些包可以删除、移除公开入口或合并实现，并给出推荐落地顺序。

结论先行：

1. **不要立刻物理删除核心能力包**。当前多数包虽然多，但承担了不同 peer dependency、产物目标或测试面。
2. **可以收敛公开入口**。未来用户文档应只推荐 `@zeus-js/zeus`、`@zeus-js/vite-plugin`、`@zeus-js/web-c`、`create-zeus`、`zeus-ui`。
3. **最值得合并的是 Web-C facade 层**：`@zeus-js/preset-component-library` 可以并入 `@zeus-js/web-c`，旧包保留一个版本周期作为兼容转发。
4. **最值得移出 workspace package 的是 `@zeus-js/shared`**：它是内部工具包，长期可改为源码内部模块，不应作为推荐安装包。
5. **`create-zeus` 与 `zeus-ui` 暂不合并**。二者都是 CLI，但用户旅程不同；合并会让命令职责变浑。

## 评估原则

本次用三个判断：

- **删除测试**：删除该包后，复杂度是消失，还是散落到多个调用方？
- **依赖测试**：该包是否隔离了独立 peer dependency 或运行环境？
- **产物测试**：该包是否代表一个明确产物目标，例如 WC、React wrapper、Vue wrapper、CSS asset、icon asset？

能通过依赖测试或产物测试的包，优先保留独立包。只做 re-export、配置组合、命名 facade 的包，优先合并。

## 当前包分层

### 用户推荐入口

| 包                     | 保留级别 | 理由                                                                |
| ---------------------- | -------- | ------------------------------------------------------------------- |
| `@zeus-js/zeus`        | 必须保留 | 框架主入口，承载响应式、DOM runtime、JSX runtime、`defineElement`。 |
| `@zeus-js/vite-plugin` | 必须保留 | 应用开发入口，和普通 Vite 项目直接集成。                            |
| `@zeus-js/web-c`       | 必须保留 | Web-C 工具链聚合入口，应该成为组件库作者的推荐入口。                |
| `create-zeus`          | 必须保留 | 项目脚手架 CLI。                                                    |
| `zeus-ui`              | 必须保留 | UI registry 安装 CLI。                                              |

### 高级/内部入口

| 包                            | 推荐动作     | 理由                                                                |
| ----------------------------- | ------------ | ------------------------------------------------------------------- |
| `@zeus-js/signal`             | 保留独立包   | 无 DOM 响应式核心，测试面和语义基础独立。                           |
| `@zeus-js/runtime-dom`        | 保留独立包   | 编译产物直接依赖，DOM helpers 与 custom element 基础在这里。        |
| `@zeus-js/compiler`           | 保留独立包   | Babel 编译器实现，供 Vite 插件和 Web-C bundler 复用。               |
| `@zeus-js/bundler-plugin`     | 保留独立包   | Rollup/Rolldown/Vite 组件构建宿主，低层扩展入口。                   |
| `@zeus-js/component-analyzer` | 保留独立包   | manifest 的唯一分析入口，可独立测试和复用。                         |
| `@zeus-js/component-dts`      | 保留独立包   | 从 manifest 到 d.ts 的独立产物阶段。                                |
| `@zeus-js/web-c-runtime`      | 保留独立包   | lazy custom element 运行时，属于生成产物依赖，不属于配置层。        |
| `@zeus-ui/registry`           | 暂保留独立包 | CLI 数据源与 copyable source registry，可被 docs/CLI/未来站点复用。 |

### 产物插件

| 包                              | 推荐动作     | 理由                                                               |
| ------------------------------- | ------------ | ------------------------------------------------------------------ |
| `@zeus-js/output-wc`            | 保留独立包   | Web Component lazy/side-effect 产物，基础目标。                    |
| `@zeus-js/output-react-wrapper` | 保留独立包   | React peer dependency 与 wrapper 产物独立。                        |
| `@zeus-js/output-vue-wrapper`   | 保留独立包   | Vue peer dependency 与 emits 类型独立。                            |
| `@zeus-js/output-css`           | 保留独立包   | CSS pipeline 可能引入 lightningcss/postcss/sass/less。             |
| `@zeus-js/output-icons`         | 暂保留独立包 | icon asset pipeline 独立；如果未来长期只被 preset 使用，可再内联。 |

## 可删除/合并候选

### 1. 合并 `@zeus-js/preset-component-library` 到 `@zeus-js/web-c`

**结论：建议合并实现，保留旧包兼容转发。**

当前 `preset-component-library` 只有一个很薄的接口：把 `output-css`、`output-wc`、`output-react-wrapper`、`output-vue-wrapper` 组合成 `componentLibrary()`。现在 `@zeus-js/web-c` 已经是 Web-C 推荐聚合入口，再保留一个单独 preset 包会增加用户心智成本。

推荐目标：

```ts
import zeus, { componentLibrary } from '@zeus-js/web-c/rolldown'
```

落地方式：

1. 将 `componentLibrary()` 源码移动到 `packages/web-c/web-c/src/componentLibrary.ts`。
2. `@zeus-js/web-c` 主入口和 adapter 子路径继续导出 `componentLibrary`。
3. `@zeus-js/preset-component-library` 改为兼容包，仅 re-export：

```ts
export { componentLibrary } from '@zeus-js/web-c'
export type {
  ComponentLibraryPresetOptions,
  ComponentLibraryTarget,
  WebCRegisterMode,
  WebCWrapperMode,
} from '@zeus-js/web-c'
```

4. 在文档中标记旧包为 deprecated，但不要立刻删除。
5. 一个 minor/beta 周期后，如果没有外部使用压力，再移除旧包发布。

收益：

- 用户入口更少。
- `componentLibrary()` 和 Web-C adapter 的默认策略在同一个包内演进。
- 测试可集中在 `@zeus-js/web-c` 的 public interface。

风险：

- 旧文档、示例或外部用户可能直接使用 `@zeus-js/preset-component-library`。
- 需要维护一个短期兼容包，避免 beta 用户升级断裂。

推荐优先级：**P1**。

### 2. 移除 `@zeus-js/shared` 的公开包身份

**结论：建议长期移为内部源码模块，不建议作为公开安装包。**

`@zeus-js/shared` 当前只有少量通用工具。删除测试显示：如果删除它，复杂度不会真正消失，但也不应该暴露为用户可安装包。它更像 monorepo 内部源码模块。

推荐目标：

```txt
packages/shared/
```

或：

```txt
packages/internal/shared/
```

落地方式：

1. 先在文档中标记 `@zeus-js/shared` 为 internal-only。
2. 从用户包列表和安装文档中移除。
3. 未来目录重排时，把它移出 `packages/core/*` 的发布集合。
4. 构建脚本支持 internal source alias，例如 `@zeus-internal/shared`。
5. 确认 `@zeus-js/compiler`、`@zeus-js/signal` 等内部包仍可稳定消费。

不建议现在直接删除：

- `signal` 和 `compiler` 都依赖它。
- 当前 release/build 脚本按 workspace package 建模，直接删除会牵连构建。

推荐优先级：**P2**。

### 3. 合并 `@zeus-js/output-react-wrapper` 与 `@zeus-js/output-vue-wrapper`

**结论：暂不合并包名，但可以合并内部公共实现。**

二者结构相似，代码规模也接近，但 peer dependency、类型模型和运行时代码不同。合并成一个公开包会带来更重的 peer dependency 和更模糊的产物目标。

可以做的内部整理：

```txt
packages/web-c/output-shared/
```

或者直接放在：

```txt
packages/web-c/component-dts/src/framework-shared.ts
packages/web-c/output-react-wrapper/src/shared.ts
packages/web-c/output-vue-wrapper/src/shared.ts
```

适合抽出的内容：

- props 过滤/序列化策略
- event binding 规范化
- component display name 推导
- d.ts detail type formatting

不建议合并公开包：

- React wrapper 依赖 React 类型和 ref 模型。
- Vue wrapper 依赖 Vue `defineComponent`、`emits`、global d.ts。
- 用户常常只需要其中一个目标。

推荐优先级：**P2，仅内部抽象**。

### 4. 合并 `@zeus-js/component-analyzer` 与 `@zeus-js/component-dts`

**结论：暂不合并。**

二者看起来常一起出现，但它们是两个不同阶段：

- analyzer：源码到 `ComponentManifest`
- dts：`ComponentManifest` 到声明文件

这个分离是有价值的。manifest 未来还会给 docs、registry、AI metadata、custom-elements.json 消费；如果合并，dts 生成会反向污染分析层。

推荐动作：

- 保留独立包。
- 在 `@zeus-js/web-c` 中统一 re-export 高层 API。
- `component-dts` 只消费 manifest，不重新分析源码。

推荐优先级：**不合并**。

### 5. 合并 `@zeus-js/output-css` 与 `@zeus-js/output-icons`

**结论：暂不合并；未来若 icon pipeline 不成熟，可移入 `@zeus-js/web-c`。**

这两个包都属于 asset output，但职责不同：

- CSS 会面对 PostCSS/Sass/Less/LightningCSS。
- Icons 会面对 SVG transform、框架 wrapper 或 registry。

短期保留独立包能避免可选依赖互相污染。未来如果 `output-icons` 长期没有独立用户或独立 peer dependency，可以考虑将它变成 `@zeus-js/web-c` 的内置 output。

推荐优先级：**P3 观察**。

### 6. 合并 `@zeus-js/vite-plugin` 与 `@zeus-js/web-c`

**结论：不要合并。**

这两个包面对不同用户旅程：

- `@zeus-js/vite-plugin`：普通 Zeus 应用，把 TSX 编译成 runtime-dom 调用。
- `@zeus-js/web-c`：组件库构建，把组件输出成 WC/React/Vue/CSS/manifest/d.ts。

合并会让普通应用用户安装 Web-C 工具链，也会把组件库构建概念带进框架入门路径。

推荐动作：

- 保留 `@zeus-js/vite-plugin`。
- `@zeus-js/web-c/vite` 可以继续 re-export Web-C bundler adapter，但文档必须区分“应用 Vite 插件”和“组件库 Vite adapter”。

推荐优先级：**不合并**。

### 7. 合并 `create-zeus` 与 `zeus-ui`

**结论：不要合并。**

二者都是 CLI，但不是同一个 interface：

- `create-zeus` 创建新项目。
- `zeus-ui` 给已有项目添加 copyable UI 组件。

合并后用户会困惑：`create zeus` 里为什么有 registry 命令，`zeus-ui` 里为什么能 scaffold app。保持两个命令更清晰。

可以共享的部分：

- prompts 风格
- package manager 检测
- 文件写入 utilities

但共享实现不等于合并 CLI。

推荐优先级：**不合并**。

### 8. 合并 `@zeus-ui/registry` 到 `zeus-ui`

**结论：暂不合并。**

`registry` 是数据和模板源，`zeus-ui` 是执行流程。分开可以让 docs、站点、测试或未来在线 registry 直接消费 registry 数据。

如果未来 registry 只服务 CLI，且没有站点/docs 复用需求，可以考虑内联到 `zeus-ui`。现在不建议。

推荐优先级：**P3 观察**。

## 最终推荐包结构

### 对外推荐安装

```txt
@zeus-js/zeus
@zeus-js/vite-plugin
@zeus-js/web-c
create-zeus
zeus-ui
```

### 保留但标记高级/内部

```txt
@zeus-js/signal
@zeus-js/runtime-dom
@zeus-js/compiler
@zeus-js/bundler-plugin
@zeus-js/component-analyzer
@zeus-js/component-dts
@zeus-js/output-wc
@zeus-js/output-react-wrapper
@zeus-js/output-vue-wrapper
@zeus-js/output-css
@zeus-js/output-icons
@zeus-js/web-c-runtime
@zeus-ui/registry
```

### 进入弃用或迁移窗口

```txt
@zeus-js/preset-component-library
@zeus-js/shared
```

## 推荐落地路线

### Phase 1：文档与入口收敛

1. 更新用户文档，只推荐五个对外入口。
2. `docs/api/packages.md` 增加“推荐入口”和“高级/内部入口”分组。
3. 标记 `@zeus-js/preset-component-library` 为兼容入口，推荐改用 `@zeus-js/web-c`。
4. 标记 `@zeus-js/shared` 为 internal-only。

验收：

- 新用户不需要理解所有 workspace package。
- 所有 Web-C 示例都从 `@zeus-js/web-c` 导入。

### Phase 2：合并 preset 实现

1. 将 `componentLibrary()` 实现移动到 `@zeus-js/web-c`。
2. `@zeus-js/preset-component-library` 改为 re-export 兼容包。
3. 测试迁移到 `packages/web-c/web-c/__tests__`。
4. 保留 `preset-component-library` 的 export snapshot，但标记 deprecated。

验收：

- `import { componentLibrary } from '@zeus-js/web-c'` 是唯一推荐写法。
- 旧 `@zeus-js/preset-component-library` 仍能通过测试。

### Phase 3：内部共享模块整理

1. 把 React/Vue output 的重复 helper 抽到内部 shared。
2. 把 `@zeus-js/shared` 从用户文档中完全移除。
3. 评估 `@zeus-js/shared` 是否能从发布包改为 internal source package。

验收：

- 不影响 `@zeus-js/signal` 和 `@zeus-js/compiler` 的构建。
- 不新增用户可见入口。

### Phase 4：删除兼容包

前置条件：

- 至少一个 beta/minor 周期内文档不再推荐旧包。
- examples、benchmarks、docs 均不再直接引用旧包。
- changelog 明确迁移路径。

可删除：

```txt
packages/web-c/preset-component-library
```

删除后：

- 从 `pnpm-workspace.yaml` 不需要改 glob，但需要更新 build package list。
- 更新 `scripts/api/*` snapshots。
- 更新 `docs/api/snapshots/*`。
- 更新 release/check 脚本中的包列表。

## 不建议做的事

### 不要把所有 Web-C 包合成一个巨包

原因：

- output 插件的 peer dependency 不同。
- 单包会让用户安装不需要的 React/Vue/CSS/icon 工具链。
- 测试面会变大，失败定位变差。

### 不要把 `runtime-dom` 合进 `zeus`

`@zeus-js/zeus` 是 facade，`runtime-dom` 是编译产物和高级集成真正依赖的 runtime。合并会破坏编译产物的清晰依赖。

### 不要把 `signal` 合进 `runtime-dom`

响应式核心必须保持无 DOM。它是 Zeus 的语义基础，不应该被 DOM runtime 牵引。

### 不要为了减少目录数移动所有包

目录重排会影响 build、release、API snapshot、docs 链接和 examples。只有当文档分组仍不能降低维护成本时，才考虑目录重排。

## 最终结论

当前最优方案不是一次性删除大量包，而是：

1. **公开入口收敛到少数包**。
2. **把浅 facade 包并入更深的聚合入口**。
3. **保留产物插件和 runtime/compiler 的独立测试面**。
4. **让 internal-only 包从用户文档和安装路径中消失**。

最推荐立即推进：

```txt
P1: 合并 @zeus-js/preset-component-library 实现到 @zeus-js/web-c
P1: 所有示例和文档统一推荐 @zeus-js/web-c
P2: 将 @zeus-js/shared 标记为 internal-only，并规划移出公开发布集合
P2: 抽取 React/Vue output 的内部重复 helper，但不合并包名
```
