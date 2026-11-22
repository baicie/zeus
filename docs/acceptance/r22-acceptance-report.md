# R22 验收报告

生成时间：2026-11-22
范围：R22 前两批（TASK 01–02/03、21–24、28、31、33、41–52、59）

**本报告只记录有实际证据的结论。** 每个 `VERIFIED` 都有可复现的命令或
registry 查询；没有跑的写 `NOT_TESTED`，跑不了的写 `BLOCKED`。

---

## 1. 里程碑状态

| 里程碑                                   | 状态         | 依据                                                                                            |
| ---------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------- |
| M1 `SSR_HYDRATION_COMBINATIONS_VERIFIED` | **部分**     | TASK 02/03 记录了三层嵌套的采纳边界（`r22-hydration-boundaries.md`）；TASK 04–20 的多数组合未做 |
| M2 `RUNTIME_LIFECYCLE_CONTRACT_VERIFIED` | **部分**     | HMR 生命周期三引擎验证（含一处竞态修复）；Show/For 嵌套作用域；其余 TASK 08–20 未做             |
| M3 `BROWSER_INFRASTRUCTURE_TRUSTED`      | **VERIFIED** | runner 每条路径都释放资源，7 项故障注入测试证明退出码正确                                       |
| M4 `INDEPENDENT_CONSUMER_ACCEPTED`       | **部分**     | packed consumer 隔离审计完成；Vite dev/prod、create-zeus 独立验收未做                           |
| M5 `RC_RECOVERY_REHEARSED`               | **VERIFIED** | 隔离 registry 演练 + 中断恢复演练，均可一条命令复现                                             |
| M6 `BETA_READINESS_EVIDENCED`            | **NO_GO**    | rc.3 的 32 包只发出 7 个，运行时一个没有；两个包 `latest` 被污染                                |

---

## 2. 本轮的三个实质发现

### 2.1 rc.3 的框架本体没有发布（推翻此前的乐观表述）

`pnpm release:audit-group --version 0.2.0-rc.3`：

```
group 32 / published 7 / missing 25 / partial
```

已发的 7 个是 `eslint-plugin`、`playground-engine`、`compiler`、
`compiler-native` 与三个平台包。**`zeus`、`runtime-dom`、`signal`、`router`、
`i18n` 都没有 rc.3。**

「7/32 已发布」听起来像部分可用。按发布顺序算，运行时在第 12 位之后，
`zeus` 在第 22 位——中断在第 8 位，所以**一个应用都建不起来**。

### 2.2 我此前对 native 安装失败的归因是错的

R22 TASK 42 写过：「rc.3 无法安装，因为缺 4 个平台包导致 optional
dependencies 整体失效」。

实测（同机器、同 registry、同版本，只换 npm）：

| npm     | 随附于     | 结果                                            |
| ------- | ---------- | ----------------------------------------------- |
| 10.9.0  | Node 22.12 | `added 1 package`，`Cannot find native binding` |
| 11.13.0 | Node 24.16 | `added 2 packages`，加载成功，能编译            |

反证：七平台全发布的 canary 在 npm 10.9.0 下依然只装 wrapper。
**缺包不是变量。**

修正后的真问题：`engines` 允许 `^22.18.0`，而该区间内每个 Node 22 自带的
npm 都是会丢包的 10.x。用户严格按 `engines` 办事会装出不能用的东西。

### 2.3 TLOG 409 根因已定位（此前为 `ROOT_CAUSE_UNCONFIRMED`）

npm 自带的 `@sigstore/sign` 能从 409 恢复（取回已存在条目），但只在
`fetchOnConflict` 为 true 时；该值默认为 false，npm 构造 witness 时也没传。
**恢复分支是死代码**，所以 409 必然变成 `TLOG_CREATE_ENTRY_ERROR`。

推论：「重试会推进」是错的——tarball 字节不变，重试必然在同一处失败。
这也解释了 `retry: 5` 为什么无效：失败发生在 tlog 阶段，还没走到 npm 的
发布接口。

---

## 3. TASK 状态表

| TASK  | 内容                                                | 状态                                       | 证据位置                                     |
| ----- | --------------------------------------------------- | ------------------------------------------ | -------------------------------------------- |
| 01    | hydration 标记边界                                  | `VERIFIED`                                 | `r22-hydration-boundaries.md`                |
| 02/03 | 嵌套 hydration 采纳边界                             | `VERIFIED`（边界记录）/ 检查本身 `BLOCKED` | 同上                                         |
| 04–20 | hydration 组合、生命周期、事件、错误契约            | `NOT_TESTED`                               | —                                            |
| 21–24 | 浏览器 runner 资源释放 + 故障注入                   | `VERIFIED`                                 | PR #365，7 项 spec                           |
| 25–27 | HMR 三引擎、Web Components 跨浏览器                 | `VERIFIED`                                 | PR #364                                      |
| 28    | CI 门禁不被 readiness 吞掉                          | `VERIFIED`                                 | PR #367，4 项 spec                           |
| 29–30 | Golden UI consumers、CI 效率                        | `NOT_TESTED`                               | —                                            |
| 31    | packed consumer 隔离审计                            | `VERIFIED`                                 | `r22-packed-consumer-audit.md`               |
| 32–40 | Vite dev/prod、create-zeus、native 七平台、SSR 独立 | `NOT_TESTED`                               | —                                            |
| 33    | native 安装验证                                     | `VERIFIED`                                 | PR #370，`check:native-install`              |
| 41    | 发布组审计                                          | `VERIFIED`                                 | PR #370，`release:audit-group`               |
| 42    | tarball 与 integrity                                | `VERIFIED`                                 | `r22-tarball-verification.md`                |
| 43    | TLOG 409 根因                                       | `VERIFIED`                                 | PR #374，`r21-rc-forensics.md` §5            |
| 45–47 | 隔离 registry 演练                                  | `VERIFIED`                                 | PR #370，`pnpm drill:isolated-registry`      |
| 48–49 | 中断恢复演练                                        | `VERIFIED`                                 | PR #370，`pnpm drill:recovery`               |
| 50    | `latest` 不得指向预发布                             | `FAILED`（政策未执行）                     | `repair:latest-tags --check` 退出 1，15 个包 |
| 51    | 首发 `latest` 绑定                                  | `VERIFIED`（机制）                         | 隔离演练受控实验                             |
| 52    | 发布顺序回归                                        | `VERIFIED`                                 | PR #373，5 项 spec                           |
| 53    | Golden 覆盖清单 + 多缺陷诊断                        | `VERIFIED`                                 | PR #376，`golden-coverage-manifest.md`       |
| 54    | EmitPlan 一致性（发射顺序 + 可解析性）              | `VERIFIED`（原有 12 项，其中 1 项已修）    | PR #376，`emit_order.rs`                     |
| 55    | native/WASM 性能差异                                | `VERIFIED`（本机 INCONCLUSIVE 判定有效）   | PR #378，`native-wasm-perf.md`               |
| 56    | CI 关键路径                                         | `VERIFIED`（测量 + 不拆的理由）            | PR #380，`critical-path-measurement.md`      |
| 57    | 公共 API 文档与类型一致                             | `VERIFIED`（示例层）                       | PR #379                                      |
| 58    | 其余文档核对                                        | `NOT_TESTED`                               | —                                            |
| 59    | 本报告                                              | —                                          | 本文件                                       |

---

## 3.5 第三批新增的两个发现

### 3.5.1 一个测试名不副实了至少几个月

`every_golden_source_emits_a_parsable_module`：名字说覆盖 golden fixture，
注释也这么说，**实际遍历的是 25 条硬编码字符串**，从不读 fixture 目录。
磁盘上 45 个，列表里 25 个，缺的正是列表从未包含的 SSR 与诊断类。

改成真的读目录后立刻失败，于是有了下一条。

### 3.5.2 fixture 的 purpose 与编译器行为相反

`types-tsx.json` 的 purpose 写「TypeScript types are erased from the
output」。**不是。** `push_source_range` 按组件区间替换 JSX，区间外原样复制——
`interface Props` 和 `props: Props` 都会进入输出，由下游 transform 擦除。

这是正确设计，但没有任何测试看过「擦除前」的输出形状。已修正 purpose，
并在遍历里对这条路径单独断言。

### 3.5.3 我在这个过程中做错了两次并回滚

用 `ZEUS_UPDATE_GOLDEN=1` 更新快照时，它重写了全部 40 个 fixture（多为纯格式
差异），两次。AGENTS.md §5 明确禁止为让测试通过而刷新快照，两次都不是有意的
输出变更，已全部回滚，最终只手工改了 1 个 fixture 的 1 行。

---

## 3.6 第四批：性能与 CI

### 3.6.1 native 与 WASM 的实测差异

| 指标     | native       | wasm         | 比值           |
| -------- | ------------ | ------------ | -------------- |
| 加载     | 11–18 ms     | 20–31 ms     | ≈1.7×          |
| 首次转换 | 3.6 ms       | 14.6 ms      | ≈4×            |
| 热转换   | 0.11–0.33 ms | 0.13–0.17 ms | **1.09–1.26×** |

代码**逐字节完全一致**——这是唯一断言的部分。

50 次迭代时同一二进制跑出 ratio 1.164 / 0.612 / 0.455，所以脚本现在计算相对
中位绝对偏差，超过阈值就打 `INCONCLUSIVE` 并省略 ratio。200 次后稳定在
1.09–1.26，离散度 2–15%。

### 3.6.2 CI 关键路径：没有单点可优化

`packed-consumers` 是 307s 里的 263s。日志分析显示最大的单项是 19 秒的 Rust
编译，其余是几十项 1–15 秒的检查——**没有可以砍的慢点**。

拆分看着显然（它装了五个独立检查），但每个新 job 固定成本约 105 秒，而最长
单项约 40 秒，搬走会让墙钟变慢。门槛写下来了：一项检查要独占超过 105 秒。

---

## 4. 需要维护者决策的事项

| #   | 事项                                                              | 为什么需要人决定                                  |
| --- | ----------------------------------------------------------------- | ------------------------------------------------- |
| 1   | `repair:latest-tags --apply`                                      | 真实 dist-tag 写入，属禁止项                      |
| 2   | 重跑 rc.3 发布                                                    | 真实 publish，属禁止项                            |
| 3   | TLOG 409 的恢复路径（换 npm 版本 / 改 tarball / 放弃 provenance） | 供应链证据判断，三种都有代价                      |
| 4   | 是否收紧 `engines` 到不包含会丢包的 npm                           | 影响 16 个包与整条支持矩阵                        |
| 5   | 是否把 `drill:*` 与 `check:native-install` 接进 CI                | 需下载 Verdaccio（约 318 包）与真实 registry 访问 |

---

## 5. 本轮未验证但容易误读的点

- **`0.2.0-rc.3` 在 npm ≥ 11 上可以安装和使用。** 缺 4 个平台包是真的，但
  影响面是那四个平台，不是全部。
- **重跑不会修复 `latest` 污染。** 重跑跳过已发版本，`eslint-plugin` 与
  `playground-engine` 的标签仍然是 rc.3。这是两件事。
- **`EPUBLISHCONFLICT` 在正常重跑里不会出现。** `skipExisting` 靠查询版本
  是否存在来跳过，不靠捕获冲突。两处证据描述的是不同路径。
- **修复 HMR 竞态时第一次没修对。** 用 reload 解决仍在 webkit 上失败；真正
  的修法是给该检查一个全新的页面。已在 PR #372 里记下这个过程。

---

## 6. 复现命令

```bash
pnpm release:audit-group --version 0.2.0-rc.3
pnpm check:native-install --version 0.2.0-rc.3
pnpm drill:isolated-registry
pnpm drill:recovery
pnpm repair:latest-tags --check
```
