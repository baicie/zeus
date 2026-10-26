# Zeus / Zeus UI 架构基线（2026-10）

本记录对应 B-001 / B-002。配置基线来自冻结 Git commit；npm、当前 dist 和本地 native compiler 的观测独立标注，不把工作树结果伪称为冻结版本的可复现发布构建。

## 源码与环境

| 仓库    | 冻结 commit                                | 根 package 版本 | tracked package.json |
| ------- | ------------------------------------------ | --------------- | -------------------- |
| Zeus    | `ca048ca51b673a3871649242f6684f4aff7b7588` | `0.1.1-beta.14` | 31                   |
| Zeus UI | `1d2c24db27b5d618083133f241d5078974a353bf` | `0.1.0-beta.32` | 36                   |

设计附件曾以 Zeus `d97e35c20014` / beta.13 为静态审查基线。本次实际工作树 HEAD 为上表版本，不能混用。配置通过 `git show <commit>:<path>` 读取，因此不受本轮并行修改 package.json 的影响。

2026-10-16 20:13（Asia/Shanghai）采集环境：macOS / arm64、Apple M1、8 核、8 GiB 内存、Node v24.19.0；两仓库配置均为 pnpm@10.33.4。系统默认 Node v22.12.0 不满足 Zeus 的 `^22.18.0 || >=24.11.0`，也不能作为本轮 JSDOM 测试验证环境。

## 一条命令重采集

在 Zeus 根目录，使用满足 engines 的 Node：

```bash
pnpm exec tsx scripts/check/capture-architecture-baseline.ts \
  --ref ca048ca51b673a3871649242f6684f4aff7b7588 \
  --ui-root ../zeus-ui \
  --ui-ref 1d2c24db27b5d618083133f241d5078974a353bf \
  --output temp/baseline/architecture-2026-10-16.json \
  --verify-boundaries
```

脚本读取配置、现有 dist、npm registry 和现有 native binary，不启动构建、不发布、不修改 Zeus UI。结果包括完整 tracked package 配置、dependencies / devDependencies / peerDependencies / optionalDependencies / exports、每个 dist 文件的原始大小 / 独立 gzip 大小 / SHA-256、registry 所有 dist-tags、三条 compiler 最小复现的诊断，以及 component-host bench 原始报告。

`--verify-boundaries` 检查当前编译器契约：Native spread、Component spread 和条件 nested JSX 都应成功编译且无 error 诊断。首次基线采集时三项均拒绝；各用例的 `previousDiagnostic` 保留当时的错误码，`expected: null` 表示当前验收要求成功。冻结源码配置、历史采集报告和当前已安装 binary 的行为观察分别记录，原始历史报告不改写。去除此选项仅采集观察。

如已在外部计时完成根构建，可增加 `--build-duration-ms <实测毫秒>` 与 `--build-log <日志路径>`。未提供时报告保留 `not_measured`；不会把 component-host fixture build 时间冒充整个仓库构建耗时。

## npm registry 实测

来源是公开 [npm dist-tags 接口](https://registry.npmjs.org/-/package/%40zeus-js%2Fzeus/dist-tags)，本次查询 65 个非 private 包，64 个成功。`@zeus-ui/registry` 返回 HTTP 401；这只表示公开请求未获授权，不能据此断言未发布或已经可用。

| 代表包                   | latest         | beta            |
| ------------------------ | -------------- | --------------- |
| `@zeus-js/zeus`          | `0.1.0`        | `0.1.1-beta.13` |
| `@zeus-js/runtime-dom`   | `0.1.0`        | `0.1.1-beta.13` |
| `@zeus-js/web-c-runtime` | `0.1.0`        | `0.1.1-beta.13` |
| `@zeus-web/button`       | `0.1.0-beta.0` | `0.1.0-beta.32` |
| `@zeus-web/input`        | `0.1.0-beta.0` | `0.1.0-beta.32` |
| `@zeus-web/dialog`       | `0.1.0-beta.0` | `0.1.0-beta.32` |
| `@zeus-web/data-grid`    | `0.1.0-beta.0` | `0.1.0-beta.32` |

Zeus 三个代表包的 canary 为 `0.1.1-canary.20261016.146.1.d97e35c2`。源码 beta.14 尚不能仅凭根 package 版本声称已经发布。Registry tags 会继续变化，复跑时以 JSON 的采集时间为准。

## 依赖与公开导出

完整配置由采集 JSON 保留，这里列出会影响架构决策的边界：

- `@zeus-js/signal` 声明 `alien-signals: ^3.2.1` 和 workspace shared；公开 `.`、`./internal`、`./diagnostics`。声明依赖不能证明生产响应式由 alien-signals 驱动，实际引擎审计另见 ADR。
- `@zeus-js/runtime-dom` 只依赖 workspace signal，导出 `.`；`web-c-runtime` 依赖 workspace runtime-dom，导出 `.`。两者不依赖 React/Vue。
- `@zeus-js/zeus` 依赖 signal、runtime-dom、runtime-ssr，导出 `.`、`./jsx`、`./jsx-runtime`、`./jsx-dev-runtime`、`./capabilities`、`./server`。
- 四个 Golden UI 包都公开 `.`、`./wc`、`./wc/auto`、`./react`、`./vue`、`./vue/global`、`./custom-elements.json`、`./zeus.components.json`。
- 四个 UI 包均固定依赖 Zeus wrapper/runtime `0.1.1-beta.13`，peer Zeus 也为 beta.13；React peer 为 `>=18 || >=19`、Vue 为 `>=3`。Data Grid 额外依赖 workspace virtual。验证本轮 beta.14 必须安装实际打包产物，不能只依赖 workspace 链接。

## dist 与时延观测

以下是采集时**当前文件系统**已有 dist 的逐文件求和；Zeus 已含本轮工作树构建结果。它们不是上述冻结 commit 的重建结果，也不是单消费者最终 bundle / npm tarball 大小。

| 范围                 |  原始字节 | 各文件独立 gzip 字节之和 |
| -------------------- | --------: | -----------------------: |
| Zeus 所有已存在 dist | 2,558,701 |                  655,709 |
| Zeus UI 所有 dist    | 2,176,551 |                  549,489 |
| runtime-dom          |   503,729 |                  124,212 |
| signal               |   372,625 |                   98,005 |
| zeus                 |   262,698 |                   72,497 |
| web-c-runtime        |    20,153 |                    5,288 |
| UI Button            |    29,856 |                    9,528 |
| UI Input             |    39,119 |                   10,972 |
| UI Dialog            |    73,093 |                   18,672 |
| UI Data Grid         |   344,113 |                   66,481 |

Zeus 有 10 个 package 路径没有 dist；其中包含 native adapter / 平台包，不能把“没有 dist 目录”解释为包无文件或已损坏。UI 36 个 package 均有 dist。采集脚本对 missing 单列状态，不写零值。

已有 `temp/bench/component-host/report.json` 的采样时间为 `2026-10-16T12:05:13.881Z`：

| 编译 fixture 观测  |    毫秒 |
| ------------------ | ------: |
| analyze.components |   97.35 |
| build.wc           | 2653.40 |
| build.wc-shadow    | 5596.74 |
| build.wc-nested    | 7690.76 |
| build.wc-react     | 4909.62 |
| build.wc-vue       | 4748.98 |
| build.all          | 3723.43 |

该报告 `git: null`，采样期间存在其他 agent 工作的资源竞争；仅保存观察，不能制定性能回归阈值，也不能用它证明根 `pnpm build` 的耗时。采集 JSON 保留原始报告和 hash，后续需固定源码、依赖、设备、并发程度再制定预算。

2026-10-17 首轮修复后，使用 Node v24.19.0 实测根 `pnpm build` 为 **8,719 ms**，退出码 0；计时覆盖命令整体，记录于 `temp/baseline/current-build.json`，原始日志 `/tmp/zeus-roadmap-final-build.log`。当时工作树尚有并行审查与浏览器下载，因此这是该机器上的一次构建观察，不能冒充冻结 HEAD 的无竞争性能预算。后续完整 `pnpm build-dts` 也已成功，日志 `/tmp/zeus-roadmap-final-dts.log`。

Rust 测试日志 `/tmp/zeus-roadmap-baseline-rust.log` 显示初次构建 52.51 秒（含 registry 下载和首次编译），64 项测试通过（1 lib + 6 IR + 26 lowering + 31 transform）；它也不是 warmed compiler 性能指标。本轮最初 unit 日志已经混入新增失败回归，只作为缺陷复现记录，不标注为干净旧版本测试基线。

## 已确认边界与风险队列

| 对应任务                                | 冻结版本/现有二进制状态                                                                                  | 最小复现或验收入口                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| S-003 / C-001：Native spread            | 当前编译器已支持有序 spread；冻结 commit 的历史观察为不支持，不能混同当前工作树实现                      | `<div {...props} />`，当前 native integration 与 runtime DOM/SSR spread tests                     |
| S-004 / C-001：Component spread         | 当前编译器已支持有序 component spread；组件 prop alias 与 children/key/ref 仍在持续验收                  | `<Child {...props} />`，当前 native integration；组件 getter/优先级专项仍待补齐                   |
| S-005：条件 nested JSX                  | 当前编译器已支持；首次基线的历史观察为 `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION`，不能作为当前拒绝预期    | `<div>{ok ? <span /> : null}</div>`，采集脚本 `nested-jsx` 与当前 native integration              |
| W-002 / W-003：Lazy 属性/默认值         | 已复现 ready 后 boolean 二次解码、默认值 Manifest 缺失；本轮修复并有回归                                 | [RFC-007](./rfcs/RFC-007-wc-prop-contract.md)、`adapter-contract.spec.ts`、`generateLazy.spec.ts` |
| W-004 / W-005：重放、identity、生命周期 | 已复现 pre-upgrade 被初始 attribute 覆盖、deep proxy 改变 identity；本轮修复并覆盖模型/竞态/runtime move | `adapter-contract.spec.ts`；真实三浏览器与完整 Form/focus 矩阵仍待执行                            |
| F-001：React SSR import                 | 设计静态检查指出风险；本轮独立 wrapper 修复与 Node/React 消费测试验收，不以本文代替通过日志              | `output-react-wrapper` runtime / generatedConsumer 测试与 packed consumer 报告                    |
| W-006 / F-004：单组件注册副作用/冲突    | 需要区分 lazy 注册、eager 模块副作用及不同 registry；单组件加载不应注册无关组件                          | `web-c-runtime` 注册测试、`output-wc` 生成测试和外部消费者矩阵                                    |
| F-005 / F-006：真实消费者               | workspace 通过不能证明 npm 包可独立安装；UI 仍依赖已发布 beta.13                                         | `npm pack` 后 native / React18 / React19 / Vue3 / Node SSR 工程                                   |
| CI / 发布                               | 未在本次采集内执行 GitHub Actions、发布或 canary 提升；registry 观察不等于发布验证                       | CI 日志、真实 tarball exports/types 与 registry install smoke 另行验收                            |

这些是仓库本地工作清单，尚未创建远端 issue。后续执行时应引用 task ID，并把完整运行报告作为验收证据；不把规范文档中的拟议能力写成已实现。
