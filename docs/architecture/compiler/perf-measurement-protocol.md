# 编译器性能测量协议

对应 TASK D。建立于 `aa1e7f4b`。

---

## 1. 为什么需要协议

此前的基线（`examples/perf-baseline.rs`）每个输入报一个中位数，别的什么都不说。
后果是本轮之前记录的 `many-bindings ≈ 2.8 ms` **无法与任何数字比较**：

- 不知道是哪个提交测的；
- 不知道 release 还是 debug；
- 不知道采样数、热身数；
- 不知道当时机器是否在跑别的东西。

本轮实测同一输入 **1.41–1.83 ms**，跨进程极差 30%。旧的 2.8 ms 很可能就是
一次离群值被当成中位数记了下来。

**一个没有附带条件的数字不是测量结果，是传说。**

---

## 2. 协议内容

`crates/zeus_compiler/examples/perf-protocol.rs`。

### 2.1 固定条件

| 项         | 值                                              |
| ---------- | ----------------------------------------------- |
| 热身       | 5 次，丢弃                                      |
| 进程内样本 | 30                                              |
| 独立进程   | 3                                               |
| profile    | release（代码检查 `debug_assertions`）          |
| feature    | 默认关闭 `stage-timing`，可用 `--features` 开启 |
| 汇总       | 中位数、Q1、Q3、MAD                             |

`environment()` 每次运行都打印 commit、rustc 版本、CPU、核数、OS、arch、
profile、feature 状态。**这些就是两次运行可能合法不同的全部原因。**

### 2.2 为什么报 MAD 而不是标准差

MAD（中位数绝对偏差）不被单个调度抖动放大。在一台同时跑着编辑器与浏览器的
机器上，均值与标准差会让一次抖动定义一个本来稳定的测量。

### 2.3 为什么跑多个进程

单进程的 30 个样本对逐样本噪声稳定，但对"整个进程落在机器更忙的时刻"
不稳定。跨进程比较才能区分这两者。

### 2.4 INCONCLUSIVE 是真实结论

跨进程极差超过 5% 时，协议打印 `VERDICT: INCONCLUSIVE` 并点名输入。
**这不是失败，是诚实**。TASK D 明确说"机器噪声过大时，明确标记 INCONCLUSIVE"。

### 2.5 没有性能门禁

TASK D 要求"不要为微小优化设置没有依据的硬性性能门禁"。协议只报告，
不返回非零退出码。理由：噪声地板是百分之几，而任何有意义的优化都在这个
量级；仓库没有专用基准机来降低地板。

---

## 3. 实测（Apple M1, 8 核, macOS 15.7.7, rustc 1.95.0, release）

### 3.1 跨进程（3 × 30 样本）

| 输入                    | 中位数   | 最小值 | 最大值 | 极差 |
| ----------------------- | -------- | ------ | ------ | ---- |
| `small`                 | 0.013 ms | 0.013  | 0.013  | 0.6% |
| `medium`                | 0.031 ms | 0.031  | 0.032  | 0.7% |
| `many-bindings (200)`   | 1.478 ms | 1.467  | 1.485  | 0.5% |
| `many-components (100)` | 0.520 ms | 0.519  | 0.562  | 0.3% |
| `fragment-dense (80)`   | 2.947 ms | 2.923  | 2.975  | 0.8% |
| `medium-ssr`            | 0.030 ms | 0.030  | 0.031  | 0.1% |

复跑两次后 `many-bindings` 出现 1.407 / 1.827 的极差（30%），协议因此判
INCONCLUSIVE。

### 3.2 阶段分解（`--features stage-timing`）

```text
nesting-guard       1.929 ms    1.1%
lower              76.278 ms   42.8%
validate            0.000 ms    0.0%
analysis            5.756 ms    3.2%
emit               94.351 ms   52.9%
```

**emit 是最贵的一段。** 这与 `fragment-dense` 的 2.8 ms 吻合：Fragment 密集
输入的成本主要在发射。

`validate` 恒为 0.000 ms——它当前没有实际工作，记录在此以免被误读为
"验证很快"。

---

## 4. 这些数字推翻了什么

### 4.1 `many-bindings` 不是 2.8 ms

本轮之前记录的值偏高约一倍。真实中位数约 1.41–1.48 ms。

### 4.2 "Fragment clone 消除带来性能改善" 无法被证实

`fragment-dense` 是唯一能暴露该成本的形状（每个 Fragment、每趟收集都会
clone 一次子树），它的跨进程极差 0.8%，看起来稳定。但：

- 该输入的中位数在多次运行间是 2.797–2.947 ms，波动 **5.4%**；
- 消除 clone 的理论收益远小于这个波动；
- **PR-A 没有任何代码改动影响性能**（只改测试与 golden）。

因此本轮**不声称任何性能改善**。TASK A 的结论是"行为未变"，不是"变快了"。

### 4.3 真正的优化目标

阶段分解指向 `emit`（52.9%）。要改善编译器吞吐，应该看 `dom/emit.rs` 的
发射路径，而不是继续微调 Fragment 收集。

---

## 5. 使用方式

```text
cargo run -p zeus_compiler --example perf-protocol --release
cargo run -p zeus_compiler --example perf-protocol --release -- --single
cargo run -p zeus_compiler --example perf-protocol --release --features stage-timing
```

比较两个提交：在**同一台机器**上各跑一次，读比值。绝对毫秒数不是基线。

---

## 6. 遗留

| 项                          | 状态                                   |
| --------------------------- | -------------------------------------- |
| 专用基准机                  | 无。这是噪声地板的根本原因             |
| CPU 亲和性 / 实时优先级     | 未设置（macOS 上不可靠）               |
| `many-bindings` 的离群成因  | 未查明；协议已能识别它，但未消除       |
| `validate` 无实际工作       | 已记录，属编译器结构问题，不属性能问题 |
| 与上一个提交的自动 A/B 对比 | 未实现；需要两个 release 构建同时在场  |
