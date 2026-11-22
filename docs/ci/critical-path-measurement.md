# CI 关键路径实测（R22 TASK 56）

测量时间：2026-11-22
数据：`ci.yml` run 45014118361（main）
方法：job 级 API 时长 + 日志时间戳间隔分析

---

## 1. 总览

```
run 总时长  307s
impact       17s
```

| Job                                | 时长     | 性质                          |
| ---------------------------------- | -------- | ----------------------------- |
| `packed-consumers`                 | **263s** | 关键路径                      |
| `create-zeus-candidates` (windows) | 228s     | 并行                          |
| `browser-playground`               | 227s     | 并行                          |
| `test`                             | 196s     | 并行                          |
| `browser-web-components`           | 161s     | 并行                          |
| `browser-runtime`                  | 131s     | 并行（该次为 failure，见 §4） |
| `build`                            | 127s     | 并行                          |
| `create-zeus-candidates` (ubuntu)  | 106s     | 并行                          |
| `rust-compiler`                    | 98s      | 并行                          |
| `lint-and-check`                   | 64s      | 并行                          |
| `docs-build`                       | 36s      | 并行                          |

**关键路径是 `packed-consumers` 的 263s**，其余全部并行且都更短。

---

## 2. `packed-consumers` 里没有单点瓶颈

按日志时间戳找超过 5s 的间隔，前十项是：

| 耗时  | 位置                                     |
| ----- | ---------------------------------------- |
| 18.9s | Rust 编译 `zeus_compiler`（release）     |
| 15.7s | `packed-consumer` producer:install       |
| 14.2s | admin webkit 套件                        |
| 9.2s  | 下载 rustup 组件                         |
| 8.7s  | admin firefox 套件                       |
| 7.1s  | packed native firefox → webkit           |
| 6.5s  | `✓ built in 290ms` → admin chromium 开始 |
| 5.7s  | SSR/explicit hydration                   |

**最大的单项是 19 秒的 Rust 编译。** 其余是几十项 1–15 秒的检查首尾相接。

这个结论很重要：**没有可以「优化掉」的慢点**。263s 是几百项小任务的累加，只
能靠并行化或减少检查数量来缩短，不能靠优化某一处。

---

## 3. 这个 Job 其实装了五个独立检查

```
pnpm check:packed-consumers     packed 消费者（native / React / Vue）
pnpm check:admin                Admin 导航，三引擎
pnpm check:hmr-packed           packed HMR，三引擎
pnpm check:hydration            显式 SSR hydration，三引擎
pnpm check:create-zeus          工作区脚手架
```

外加 playwright 三引擎安装（约 50s）与 `native:build:platform`。

### 3.1 为什么不拆

之前已经拆过一次（`browser-web-components` / `browser-playground` /
`browser-runtime`），拆分的成本结构是：

```
每个新 Job 的固定成本 ≈ 105s
  setup + install + native build + pnpm build + build-dts   ~55s
  playwright install --with-deps                             50s
```

新增一个 job 若只搬走一项 50s 的检查，净效果是**变慢**（+105s 固定成本
− 50s 关键路径）。上面五项里最长的单项约 40s（admin 三引擎 8.7+14.2+…），
单独拆出去同样不划算。

**结论：当前不拆是对的，但理由应该写下来，而不是凭直觉。** 拆分的门槛是
「搬走的检查在新 job 里独占超过 105s」。

### 3.2 真正可以省的那部分

`playwright install --with-deps` 50s 里有 41s 是 apt 依赖。这一项在
`browser-*` 四个 job 里各付一次。如果做一个预装浏览器镜像，四处合计可省
约 164s 的墙钟——但那是**总时长**，关键路径只省 41s。

成本是多维护一个镜像与它的更新流程。是否值得是独立决策，本轮不做。

---

## 4. `browser-runtime` 在那次运行里是 failure

131s，failure。原因是当时用的代码还没有 #372 的 HMR 竞态修复
（`a module that omits onCleanup` 在 chromium/webkit 上超时）。

**这条记录在这里的意义**：CI 失败会让 `ci-gate` 立刻失败，总时长 307s 里
包含了一次失败的 job。修复合入后这一项应恢复为 success，那时总时长会略微
上升（跑完全部检查而不是提前失败）。

---

## 5. 未做

| 项                              | 原因                                           |
| ------------------------------- | ---------------------------------------------- |
| 预装浏览器镜像                  | 需维护镜像与更新流程，是独立决策               |
| 把 `check:admin` 等拆成独立 job | 上面算过，净变慢                               |
| 跨运行的历史趋势                | 需要连续采样多次成功运行；本轮只有一次完整数据 |
| 缩短 `rust-compiler` 的 98s     | 它不在关键路径上（与 263s 并行）               |
