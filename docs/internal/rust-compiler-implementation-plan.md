# Rust 编译器实施计划

本计划执行 RFC-005。每个任务保持为可独立验证的小切片；默认编译器在完整 parity
之前仍是当前 Babel 实现，但不会增加公开后端开关或 fallback。

## 依赖图

```text
RFC-005 / transformModule contract
  -> Rust workspace + toolchain
    -> owned IR + diagnostics
      -> Oxc parse / semantic / lowering
        -> DOM passes / codegen / source map
          -> napi-rs adapter
            -> Node runtime test
              -> Vite integration test
                -> CI + platform packaging
```

## Phase 1：设计与基础设施

### Task 1：固化架构决策

**说明：** 记录 Oxc / SWC / 其他方案比较、跨语言边界、span 单位、NAPI 接口和最终删除
Babel 的门槛。

**验收标准：**

- [x] RFC 明确选择 Oxc `0.144.0` + napi-rs 3，并解释拒绝其他方案的原因。
- [x] Oxc AST 不进入 IR / NAPI / TypeScript 公共类型。
- [x] 明确不存在公开双后端和 Babel fallback。

**验证：**

- [x] `pnpm exec prettier --check docs/rfcs/RFC-005-rust-compiler.md docs/internal/rust-compiler-implementation-plan.md`

**依赖：** 无

**涉及文件：** RFC-005、RFC index、本计划

### Task 2：建立 Rust workspace

**说明：** 建立只包含纯 core 和 Node adapter 的 Cargo workspace，锁定 Rust / Oxc
版本并配置一致的 fmt、clippy 和 test 命令。

**验收标准：**

- [x] `rust-version = 1.95.0`，Oxc crates 全部精确为 `=0.144.0`。
- [x] 不启用 Oxc `full` umbrella feature。
- [x] `cargo fmt --all -- --check`、`cargo clippy --workspace --all-targets --locked -- -D warnings`、
      `cargo test --workspace --locked` 可在干净 checkout 运行。

**验证：** 上述三个 Cargo 命令。

**依赖：** Task 1

**预计规模：** S

## Phase 2：首个 compiler core 纵向切片

### Task 3：owned IR 与结构化诊断

**说明：** 为首个 fixture 定义 owned module / element / text / dynamic text IR 和诊断，
提供 serde round-trip 与 deterministic ID 测试。

**验收标准：**

- [x] IR 不包含任何 Oxc 类型或 arena lifetime。
- [x] 同一输入重复和并行 lowering 得到相同 ID / ref。
- [x] span 遵守 UTF-8 byte offset、1-based line、0-based UTF-16 column 规则。

**验证：** `cargo test -p zeus_compiler --locked --test ir`

**依赖：** Task 2

**预计规模：** M

### Task 4：Oxc parse、semantic 与 native element lowering

**说明：** 解析 TSX 模块，建立 semantic model，将 fixture 的原生元素、静态 attribute、
静态 text 和动态 text 降级为 owned Zeus IR；不支持用法返回稳定诊断。

**验收标准：**

- [x] 支持 RFC fixture，表达式源码和 span 精确保留。
- [x] parser 错误和 spread attribute 均返回带稳定 code / filename / span 的诊断。
- [x] emoji、CJK、CRLF 前缀 fixture 的 span 转换正确。

**验证：** `cargo test -p zeus_compiler --locked --test lower`

**依赖：** Task 3

**预计规模：** M

### Task 5：DOM codegen 与 source map

**说明：** 从 owned IR 生成静态 template、clone、anchor、`bindText` 和 helper import，
并生成 Source Map v3。

**验收标准：**

- [x] 输出不包含 JSX，并调用现有 `@zeus-js/runtime-dom` helper。
- [x] 生成标识符不会与输入模块 binding 冲突。
- [x] source map 将生成代码中的动态表达式映射回原 TSX 表达式。

**验证：** `cargo test -p zeus_compiler --locked --test transform`

**依赖：** Task 4

**预计规模：** M

### Checkpoint A

- [x] `cargo test -p zeus_compiler --locked` 全通过。
- [x] fixture 完成 TSX -> IR -> code + map，不依赖 Babel。
- [x] core API 不暴露 Oxc 类型。

## Phase 3：Node 与 Vite 路径

### Task 6：薄 napi-rs adapter

**说明：** 用私有 `@zeus-js/compiler-native` package 承载 `zeus_compiler_node`，导出唯一
`transformModule(options)`，不复制 compiler 逻辑。

**验收标准：**

- [x] 正常结果包含 code、map、diagnostics。
- [x] compiler diagnostics 不被折叠为 exception string。
- [x] panic 被 containment，不跨越 NAPI ABI。

**验证：** native build + Node contract tests。

**依赖：** Checkpoint A

**预计规模：** M

### Task 7：真实 runtime 与 Vite 集成测试

**说明：** Node 测试调用 native compiler；Vite fixture 使用内部 native plugin 编译并在
JSDOM 中执行，验证 DOM 和细粒度更新。

**验收标准：**

- [x] 初始 DOM 包含 emoji / CJK 静态前缀与 `Hello Ada` 动态文本。
- [x] signal 更新后只更新 text binding，组件函数不重新执行。
- [x] Vite transform/build 均无残留 JSX，map 通过 `@jridgewell/trace-mapping` 精确断言。

**验证：** `pnpm test:compiler-native`

**依赖：** Task 6

**预计规模：** M

### Task 8：CI 基线

**说明：** 在主 CI 增加 Rust fmt/clippy/test 和当前平台的 native integration job；跨平台
prebuild matrix 留到 native package 进入发布前完成。

**验收标准：**

- [x] CI 安装固定 Rust toolchain 并缓存 Cargo artifacts。
- [x] native integration 不依赖开发机已有 `.node` 文件。
- [x] JS-only jobs 不被未构建的私有 native package 破坏。

**验证：** 本地复现 CI 命令并检查 workflow syntax。

**依赖：** Task 7

**预计规模：** S

### Checkpoint B

- [x] Cargo fmt、clippy、tests 全通过。
- [x] native package build、Node runtime、Vite integration 全通过。
- [x] 现有 compiler / compiler-shared targeted tests 全通过。
- [x] `pnpm check`、`pnpm lint`、`pnpm build` 不回归。

## Phase 4：迁移切片 1 - 原生 DOM parity

### Task 9：统一 attribute IR 与 lowering

**说明：** 在 owned Rust IR 中补齐 static、attribute、property、event 和 ref binding，
并让 lowering 保留表达式源码、span 与 binding 语义。

**验收标准：**

- [x] bare / string attribute 与 `className` 规范化后保持浏览器语义。
- [x] `{expr}`、`prop:name={expr}`、`onEvent={handler}`、`ref={target}` 分别进入正确 IR。
- [x] IR 保存 getter / member expression form；empty / string ref、spread 和非法 namespace
      返回稳定诊断。

**验证：** `cargo test -p zeus_compiler --locked --test ir --test lower`

**依赖：** Checkpoint B

**预计规模：** M

### Task 10：生成 attribute / property / ref bindings

**说明：** 复用 runtime-dom 现有 helper，生成 `bindAttr`、`bindClass`、`bindStyle`、
`bindProp` 和 `bindRef` 调用，不增加新的运行时抽象。

**验收标准：**

- [x] getter 函数直接传递，普通表达式只包一层 getter。
- [x] binding 通过 clone 后的稳定 locator 指向正确元素，不依赖源码 child index。
- [x] source map 将每个生成表达式精确映射回 TSX。

**验证：** `cargo test -p zeus_compiler --locked --test transform`

**依赖：** Task 9

**预计规模：** M

### Task 11：生成 event binding 与 delegation

**说明：** 生成 `bindEvent`，按模块收集并去重 delegated event；member handler 保持
可选调用和 `currentTarget` 语义。

**验收标准：**

- [x] inline、identifier、member、optional / computed member handler 均可执行且保留 receiver。
- [x] `delegateEvents` 只在启用且存在事件时生成一次，事件名稳定排序。
- [x] 真实 DOM 测试证明事件触发、组件不重执行且 scope disposal 清理 handler。

**验证：** `cargo test -p zeus_compiler --locked && pnpm test:compiler-native`

**依赖：** Task 10

**预计规模：** M

### Task 12：补齐原生元素特殊语义

**说明：** 覆盖 raw-text / escapable-raw-text、SVG、custom element、void element 和
浏览器 HTML 规范化场景；需要专用生成策略的节点不得依赖脆弱 marker 查找。

**验收标准：**

- [x] `script` / `style` / `textarea` / `title` 动态文本通过 `bindTextContent` 正确执行。
- [x] SVG、custom element、table 与标准 void element 的静态模板和 bindings 正确。
- [x] `<template>` 等未有专用 path 的结构保持稳定诊断，不发生运行时空 anchor 崩溃。

**验证：** `cargo test -p zeus_compiler --locked && pnpm test:compiler-native`

**依赖：** Task 11

**预计规模：** M

### Checkpoint C：原生 DOM parity

- [x] Rust 覆盖现有原生元素、binding、ref 与 event compiler fixtures。
- [x] JSDOM 证明 text / attr / prop / class / style 更新精确且组件只执行一次。
- [x] Rust IR 与 compiler-shared canonical JSON fixtures 等价。

## Phase 5：迁移切片 2-3 - Fragment、组件与控制流

### Task 13：Fragment lowering 与 codegen

**说明：** 支持 root / nested Fragment，以真实 `DocumentFragment` 或稳定区域插入，
不引入虚拟节点。

**验收标准：**

- [x] root 和 nested Fragment 可混合静态元素与动态 bindings。
- [x] Fragment 中的 source map、名称分配和连续 marker 保持稳定。
- [x] 返回与插入行为使用真实 DOM 节点，更新不替换未受影响的 sibling。

**验证：** Rust transform tests + native JSDOM Fragment fixture。

**依赖：** Checkpoint C

**预计规模：** M

### Task 14：普通组件 lowering 与 codegen

**说明：** 支持 identifier / member component、动态 props、children 和 nested JSX，
生成现有 `createComponent` / `insert` runtime 调用。

**验收标准：**

- [ ] component props 使用 lazy getter，函数值不被误调用或双包裹。
- [ ] component children 只初始化一次，并能返回 Element / Fragment。
- [ ] native element 与 component 相互嵌套时 binding 与清理作用域正确。

**验证：** Rust tests + native JSDOM component execution fixtures。

**依赖：** Task 13

**预计规模：** M

### Task 15：收敛 module-level IR 与名称分配

**说明：** 让 Module IR 显式承载 templates、runtime imports、delegated events 和 target
metadata；所有生成名称由 Rust codegen 统一分配。

**验收标准：**

- [ ] module-level artifacts 不再藏在前端 adapter 状态中。
- [ ] binding、unresolved global、import alias 与多 root 情况均无名称冲突。
- [ ] 同一模块重复和并行编译得到 byte-for-byte 相同 code / map / diagnostics。

**验证：** Rust IR round-trip、determinism 与 transform tests。

**依赖：** Task 14

**预计规模：** M

### Task 16：`Show` lowering 与区域挂载

**说明：** 基于 runtime-dom `mountShow` 生成条件区域，支持 fallback 与分支 scope 清理。

**验收标准：**

- [ ] 只识别来自 Zeus runtime 的 `Show` symbol，局部同名组件不被误判。
- [ ] true / false / fallback 切换只替换区域内容，不重执行父组件。
- [ ] 每次卸载分支都会释放该分支 effects 和 cleanup。

**验证：** Rust tests + native JSDOM Show lifecycle fixture。

**依赖：** Task 15

**预计规模：** M

### Task 17：`For` lowering 与 keyed reconciliation

**说明：** 基于 runtime-dom `mountFor` 生成列表区域，支持 item、index 和可选 `by` key。

**验收标准：**

- [ ] 只识别 Zeus runtime 的 `For` symbol，并诊断非法 child callback。
- [ ] keyed reorder 复用已有节点，新增 / 删除项分别创建 / dispose 自身 scope。
- [ ] index accessor 和空列表行为与 runtime contract 一致。

**验证：** Rust tests + native JSDOM For identity / cleanup fixture。

**依赖：** Task 16

**预计规模：** M

### Task 18：DOM path passes 与子树 disposal parity

**说明：** 收敛静态节点、marker 和区域的物理寻址，覆盖 component / Fragment / Show /
For 混排，验证所有子树资源释放。

**验收标准：**

- [ ] HTML parser 规范化不会改变生成代码所寻址的节点。
- [ ] 连续动态区域、nested control flow 与多 root 不产生 marker 位移。
- [ ] runtime cleanup tests 在 Rust 编译产物上全部成立。

**验证：** Rust path tests + native runtime cleanup parity suite。

**依赖：** Task 17

**预计规模：** M

### Checkpoint D：DOM 组件与控制流 parity

- [ ] Fragment、普通组件、Show、For 的现有 compiler 语义由 Rust 覆盖。
- [ ] 真实 runtime identity、reconciliation 和 cleanup 测试通过。
- [ ] DOM codegen 不包含 Babel / Oxc AST 泄漏或 VNode 路径。

## Phase 6：迁移切片 4 - Web Components

### Task 19：基于 semantic symbol 识别 `defineElement`

**说明：** 用 Oxc semantic reference 识别 Zeus runtime 的 direct / aliased import 与命名
setup，建立 defineElement render-root 元数据。

**验收标准：**

- [ ] inline 和 named setup、direct 和 aliased import 均被识别。
- [ ] shadowed / local same-name function 不被识别为编译期内置。
- [ ] Host / Slot 非法位置返回与 RFC-003 一致的结构化诊断。

**验证：** Rust semantic tests + migrated compiler diagnostic fixtures。

**依赖：** Checkpoint D

**预计规模：** M

### Task 20：`Host` lowering 与 codegen

**说明：** 将 defineElement root Host 编译为宿主边界，生成 host attribute / property /
event bindings，并保留 shadow / light DOM 挂载语义。

**验收标准：**

- [ ] Host 只能作为 defineElement render root，nested Host 稳定报错。
- [ ] class、style、ARIA、property 与 event getter 不双包裹。
- [ ] Host 自身不是运行时 DOM 子节点，组件输出挂载到正确宿主目标。

**验证：** Rust tests + migrated host transform / runtime execution fixtures。

**依赖：** Task 19

**预计规模：** M

### Task 21：`Slot` lowering 与投影 parity

**说明：** 生成现有 `createSlot` 调用，在 Shadow DOM 使用原生 slot，在 Light DOM 使用
Zeus 投影 runtime，支持 name 与 fallback。

**验收标准：**

- [ ] default / named / multiple slot 与 fallback 均正确。
- [ ] Light DOM MutationObserver 更新、节点 identity 与 context bridge 保持成立。
- [ ] Slot 只能位于合法 Host 子树，local same-name component 不被误判。

**验证：** Rust tests + native defineElement shadow / light DOM fixtures。

**依赖：** Task 20

**预计规模：** M

### Checkpoint E：Web Components parity

- [ ] 现有 Host、Slot、defineElement compiler fixtures 全部迁移到 Rust。
- [ ] Shadow / Light DOM、props、emit、styles、slot 和 lifecycle 真实执行通过。
- [ ] Web Components 断开连接会释放对应 reactive root。

## Phase 7：迁移切片 5-6 - SSR、HMR 与 source map

### Task 22：SSR 原生元素 codegen

**说明：** 为同一 owned IR 增加 RFC-004 SSR codegen，复用 runtime-ssr helper 与现有
escaping / property serialization 语义。

**验收标准：**

- [ ] static / dynamic text、attribute、class、style 和可序列化 property 正确转义。
- [ ] event / ref 不进入 SSR HTML，raw-text closing sequence 安全处理。
- [ ] 无 HTML 等价表示的 property 与 Host / Slot 返回稳定诊断。

**验证：** Rust SSR tests + migrated SSR native-element fixtures。

**依赖：** Checkpoint E

**预计规模：** M

### Task 23：SSR component 与控制流 codegen

**说明：** 生成 `ssrComponent`、`ssrShow`、`ssrFor`，支持 Fragment、lazy props / children
和 raw-text 内控制流。

**验收标准：**

- [ ] component、Fragment、Show、For 输出与 RFC-004 一致。
- [ ] raw-text 内 nested control flow 不发生双重 escaping。
- [ ] DOM 与 SSR lowering 共用同一 owned semantic IR。

**验证：** Rust SSR tests +真实 runtime-ssr Node execution fixture。

**依赖：** Task 22

**预计规模：** M

### Task 24：完整 source-map chain

**说明：** 对 DOM / SSR 所有用户表达式生成 Source Map v3，并验证 native map 经 Vite dev、
Vite build、Rollup / Rolldown 后仍回到原 TSX。

**验收标准：**

- [ ] emoji、CJK、CRLF、query module id 与多表达式映射精确。
- [ ] 无原始来源的 helper / template 不伪造映射。
- [ ] 宿主 transformer 合并 map，不重新猜测源码位置。

**验证：** Rust map tests + Vite / Rollup / Rolldown trace-mapping fixtures。

**依赖：** Task 23

**预计规模：** M

### Task 25：Rust HMR pass

**说明：** 用 Oxc semantic 信息识别顶层 `render` import / call，生成 dispose-and-remount
boundary；显式用户 HMR boundary 保持优先。

**验收标准：**

- [ ] dev client transform 只为真实顶层 render root 注入 HMR boundary。
- [ ] production、SSR、component-only 与已有 `import.meta.hot` 模块不注入。
- [ ] accepted update 先 dispose 旧 root，再执行新模块且 source map 保持可追踪。

**验证：** Rust HMR tests + migrated Vite HMR execution fixtures。

**依赖：** Task 24

**预计规模：** M

### Checkpoint F：SSR 与开发链 parity

- [ ] RFC-004 SSR compiler 与真实 runtime execution tests 全通过。
- [ ] Vite dev / build / SSR / HMR 的 source map 和错误位置精确。
- [ ] Babel HMR plugin 已无独有语义。

## Phase 8：迁移切片 7-8 - 宿主与发布

### Task 26：统一 Vite 与 Web-C adapters

**说明：** `@zeus-js/vite-plugin` 和 Web-C Vite / Rollup / Rolldown adapters 统一调用
`transformModule`，只保留过滤、宿主错误转换和必要的 TypeScript downlevel 职责。

**验收标准：**

- [ ] 所有宿主消费 Rust 返回的 code / map / diagnostics，无 Babel fallback。
- [ ] Vite DOM / SSR、Web-C Vite / Rollup / Rolldown 真实 fixture 全通过。
- [ ] native 加载失败明确报错，不静默返回未编译 JSX。

**验证：** plugin targeted tests +真实 Vite / Rollup / Rolldown builds。

**依赖：** Checkpoint F

**预计规模：** M

### Task 27：建立三平台 prebuild packages

**说明：** 为 macOS、Linux、Windows 的受支持 Node 架构生成 optional platform packages，
公共 `@zeus-js/compiler` loader 只负责选择匹配 binary。

**验收标准：**

- [ ] 每个平台 package 只包含对应 `.node`、license、repository 与一致版本。
- [ ] loader 在支持目标加载正确 binary，在不支持目标给出包含 load errors 的明确异常。
- [ ] 干净 checkout 的 matrix job 构建、上传、下载并执行同一 contract tests。

**验证：** GitHub Actions platform matrix + artifact smoke tests。

**依赖：** Task 26

**预计规模：** M

### Task 28：provenance、canary 与性能基线

**说明：** 将 native packages 纳入现有 release / canary 流程，验证 npm provenance、版本
一致性、安装加载，并记录 Babel / Rust 的时间和产物大小基线。

**验收标准：**

- [ ] canary 从同一 commit 发布 wrapper 与全部 platform packages 并通过安装 smoke test。
- [ ] provenance、license、fixed version / optional dependency 校验全部通过。
- [ ] 记录可复现 cold / warm compile、峰值内存与 binary/package size，不作无数据性能声明。

**验证：** release dry-run、canary workflow、fresh-project install test、benchmark report。

**依赖：** Task 27

**预计规模：** M

### Checkpoint G：默认切换门槛

- [ ] DOM、SSR、Web Components、diagnostics 与 HMR 语义 parity 全部通过。
- [ ] Vite、Rollup、Rolldown source-map chain 精确。
- [ ] Linux、macOS、Windows prebuild、provenance、canary 和性能基线有可审计证据。

## Phase 9：迁移切片 9 - 一次性删除 Babel 编译链

### Task 29：切换唯一公共 compiler 入口

**说明：** `@zeus-js/compiler` 直接暴露 Rust `transformModule` 契约，删除公开 Babel plugin
形态；仓库内调用方一次性迁移到唯一接口。

**验收标准：**

- [ ] 不存在公开 backend 选项、兼容 alias、deprecated export 或 fallback。
- [ ] compiler options 收敛为实际生效的唯一 transform contract。
- [ ] 所有仓库内调用方和 API snapshots 已迁移。

**验证：** typecheck、API Extractor、exports / CJS checks。

**依赖：** Checkpoint G

**预计规模：** M

### Task 30：删除 Babel compiler、HMR 与重复 adapters

**说明：** 删除 `packages/core/compiler` 中 Babel parse / lower / passes / codegen、Vite Babel
HMR plugin、Web-C Babel transform 和只服务旧实现的测试 / 配置。

**验收标准：**

- [ ] compiler、Vite plugin 与 Web-C transform 路径不再导入 `@babel/core` / `@babel/types`。
- [ ] 旧 CompilerOptions、Babel snapshots 和重复 transform adapters 已删除而非保留转发层。
- [ ] `rg` 静态检查证明所有编译宿主只调用 Rust `transformModule`。

**验证：** dependency boundary tests + `rg` guard + full build。

**依赖：** Task 29

**预计规模：** M

### Task 31：全量质量门禁与独立复核

**说明：** 在最终删除态运行 Rust、Node、pnpm、bundler、release 和跨平台门禁，并按正确
性、可读性、架构、安全、性能五轴独立复核。

**验收标准：**

- [ ] Cargo fmt / clippy / tests / audit 与全部 JS tests / type / lint / build 通过。
- [ ] package、exports、API、repository、release dry-run 和 platform install gates 通过。
- [ ] 独立复核无 P0 / P1；工作树干净且每个迁移 checkpoint 有可构建提交。

**验证：** 主 CI、native matrix、release canary 和本计划全部命令。

**依赖：** Task 30

**预计规模：** M

### Checkpoint H：Rust 迁移完成

- [ ] `@zeus-js/compiler` 的唯一实现为 Rust core + native loader。
- [ ] Babel compiler / Babel HMR / fallback / 旧配置 / 重复 adapter 均不存在。
- [ ] 本计划所有 acceptance criteria 与外部平台证据齐全。

## 风险控制

| 风险                           | 影响 | 控制方式                                                               |
| ------------------------------ | ---- | ---------------------------------------------------------------------- |
| Oxc 0.x API 漂移               | 高   | 精确锁版；Oxc 类型仅在 adapter 内；升级单独 PR                         |
| IR 在 TS / Rust 间漂移         | 高   | JSON golden fixture + 双端 round-trip；默认切换前收敛 canonical schema |
| Unicode span / source map 错误 | 高   | emoji、CJK、CRLF fixture；trace-mapping 精确断言                       |
| NAPI 平台发布复杂              | 高   | 迁移期保持 private；默认切换前完成三平台 prebuild 与 provenance        |
| 旧 Rust 实现诱导横向铺开       | 中   | 不恢复旧代码；始终用可执行 tracer bullet 推进                          |
| Babel / Rust 长期共存          | 高   | 不公开 backend；parity 后一次切换并删除 Babel                          |

## 完成定义

完整迁移只有在 Checkpoint C 至 H 全部满足、三平台与 canary 证据齐全、代码质量复核
无阻塞项、分支提交保持可构建时才算完成。“RFC 已写”“Cargo 能编译”“首个 tracer
bullet 可执行”或“默认宿主已切换但 Babel 仍存在”均不构成完整 Rust 化。
