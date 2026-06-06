# Component Compiler Host Roadmap

阶段式组件编译器宿主路线图。

---

## 总体目标

```
Zeus Runtime / Compiler 稳定
      ↓
跨框架 Web Component 编译插件
      ↓
Headless Web Component 组件底座
      ↓
React / Vue 类型安全 wrapper
      ↓
shadcn-like 可复制、可定制 UI 层
```

---

## 当前状态总览

| 阶段     | 内容                       | 状态      |
| -------- | -------------------------- | --------- |
| Phase 0  | MVP 稳定化补强             | ✅ 完成   |
| Phase 1  | 增强 Host 定位             | ✅ 完成   |
| Phase 2  | Component Analyzer         | ✅ 完成   |
| Phase 3  | Bundler Plugin Host        | ✅ 完成   |
| Phase 4  | Web Component Output       | ✅ 完成   |
| Phase 5  | DTS 输出体系               | ✅ 完成   |
| Phase 6  | React / Vue Wrapper Output | ✅ 完成   |
| Phase 7  | Headless Components MVP    | ✅ 完成   |
| Phase 8  | 性能与体积基准             | ✅ 完成   |
| Phase 9  | Icon 专用 no-runtime 输出  | ✅ 完成   |
| Phase 10 | shadcn-like Registry       | 🔄 进行中 |
| Phase 11 | 文档与生态发布             | 🔄 进行中 |

详细设计记录见 `design/` 目录下各 phase 文档。

---

## 各阶段摘要

### Phase 0 — MVP 稳定化补强 ✅

先保证 Zeus 当前已有能力足够稳定，尤其是 Web Component、Slot、compiler 产物。

关键测试点：`defineElement` props default、attribute/property 同步、boolean attribute、reflect、CustomEvent detail、shadow Slot、light DOM Slot、disconnected cleanup、styles injection、Host data-state / aria / class / style。

### Phase 1 — 增强 Host 定位 ✅

明确架构边界：

- `defineElement` = Web Component 定义层
- `Host` = 宿主元素渲染控制层
- `Slot` = 内容分发层

`Host` 在 `defineElement` 的 setup 内部控制宿主元素状态，不承担 `customElements.define`。

### Phase 2 — Component Analyzer ✅

从 `defineElement` 自动抽取 meta，避免重复写 `.meta.ts`。位于 `@zeus-js/component-analyzer`。

输入 `defineElement` 源码，输出 `ComponentManifest`（tag、name、props、events、slots、cssParts、methods、models 等）。

信息优先级：options.props > TS Props 类型 > setup 里的 emit() > JSX 里的 Slot/Host/part/data-state > options.meta 补充。

### Phase 3 — Bundler Plugin Host ✅

做 Rollup / Vite / Rolldown 通用插件宿主。位于 `@zeus-js/bundler-plugin`。

插件模型抽象 `ZeusOutputPlugin`，支持 `buildStart`、`virtualModules`、`generateBundle` 钩子。

### Phase 4 — Web Component Output ✅

输出原生 Web Component 使用入口。位于 `@zeus-js/output-wc`。

输出结构：

- `dist/wc/{component}.js`
- `dist/wc/index.js` barrel
- `dist/custom-elements.json`
- `dist/zeus.components.json`
- `dist/wc/index.d.ts`

### Phase 5 — DTS 输出体系 ✅

所有输出都带自己的类型。位于 `@zeus-js/component-dts`。

输出 WC / React / Vue / JSX IntrinsicElements 四套类型。

### Phase 6 — React / Vue Wrapper Output ✅

生成类型安全 wrapper，底层仍然只使用 Web Component。

- `@zeus-js/output-react-wrapper` — ref + property sync + CustomEvent bridge
- `@zeus-js/output-vue-wrapper` — defineComponent + props + emits + event bridge + v-model

### Phase 7 — Headless Components MVP ✅

做底层 headless 组件，不做强样式。位于 `@zeus-ui/headless`。

首批组件：z-button、z-icon、z-switch、z-checkbox、z-tabs、z-dialog。

Headless 规范：默认 `shadow: false`；通过 `data-state / data-disabled / data-size / data-variant` 暴露状态；通过 `Slot` 暴露结构；通过 `CustomEvent` 暴露行为。

### Phase 8 — 性能与体积基准 ✅

验证"只使用一个组件时 runtime 是否过重"和"跨框架 wrapper 是否有额外成本"。

Benchmark 分类：编译期 benchmark、runtime benchmark、wrapper benchmark、bundle size benchmark。

### Phase 9 — Icon 专用 no-runtime 输出 ✅

解决"只用一个 icon 但 runtime 过重"的问题。

输出两种模式：

- `runtime mode`：`z-icon name="home"` 依赖完整 runtime
- `static mode`：`IconHome` 直接输出 SVG，不依赖 Zeus runtime，支持 tree-shaking

位于 `@zeus-js/output-icons`。

### Phase 10 — shadcn-like Registry 🔄

做第二层 UI 封装：用户可以按需复制组件源码到项目里，自定义样式和主题。

工具链：

- `@zeus-ui/registry` — UI 组件注册表
- `zeus-ui` CLI — 添加/删除/更新组件

用户旅程：

```bash
pnpm dlx zeus-ui init
pnpm dlx zeus-ui add button
pnpm dlx zeus-ui add dialog
```

生成：`src/components/ui/{component}.tsx`、`src/lib/utils.ts`、`src/styles/theme.css`

### Phase 11 — 文档与生态发布 🔄

让外部用户能理解这套体系。

文档结构：Guide / Examples / Components / Compiler Host / API / Advanced。

---

## 推荐版本节奏

| 版本       | 内容                                                                          |
| ---------- | ----------------------------------------------------------------------------- |
| **v0.1.0** | Zeus Framework MVP — 稳定 signal/runtime-dom/compiler/vite-plugin             |
| **v0.2.0** | Component Compiler Host — component-analyzer、bundler-plugin、output-wc       |
| **v0.3.0** | Cross Framework Wrapper — output-react-wrapper、output-vue-wrapper、dts 输出  |
| **v0.4.0** | Headless Components — @zeus-ui/headless 六组件 + wc/react/vue 输出 + 性能基准 |
| **v0.5.0** | shadcn-like Registry — zeus-ui CLI、registry、theme system                    |

---

## 包位置总览

```
@zeus-js/zeus            — 统一入口
@zeus-js/signal          — 响应式核心
@zeus-js/runtime-dom     — DOM runtime + defineElement
@zeus-js/compiler        — Babel JSX 编译器
@zeus-js/vite-plugin     — Vite 集成插件
@zeus-js/web-c           — Web-C 聚合入口

@zeus-js/bundler-plugin  — bundler 插件宿主（Vite/Rollup/Rolldown）
@zeus-js/component-analyzer — 源码 -> ComponentManifest
@zeus-js/component-dts  — ComponentManifest -> .d.ts
@zeus-js/output-wc      — Web Component 输出
@zeus-js/output-react-wrapper — React wrapper 输出
@zeus-js/output-vue-wrapper  — Vue wrapper 输出
@zeus-js/output-icons    — 无运行时图标输出
@zeus-js/output-css      — CSS 资源输出

@zeus-ui/headless        — Headless 组件底座
@zeus-ui/registry        — UI 组件注册表（copyable 源码）
zeus-ui                  — CLI 工具（add/remove/update 组件）
create-zeus              — 项目脚手架生成器
```
