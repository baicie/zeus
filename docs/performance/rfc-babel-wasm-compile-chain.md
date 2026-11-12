# RFC: Playground 编译链是否应移除 Babel

状态：**提案，未实施**
日期：2026-11-12
基线：`main` @ `8f8f5256`
前置报告：`docs/performance/build-size-audit.md`（体积审计）

---

## 0. 结论摘要

**不建议以"替换 Babel"为目标立项。建议立项做三件更小、收益更确定的事。**

用户可能期待"Babel 2.2 MB 太大，用 WASM 编译器替掉它"。实测数据不支持这个推理：

1. **WASM 编译器不做 TypeScript 类型擦除。** 它对 `.tsx` 用 `SourceType::from_path()` 解析（`lower.rs:64`），但 codegen 的策略是"组件区间内替换、区间外原样复制"（`codegen.rs:310-343`、`4754-4784`）。对 200 个真实 `.ts`/`.tsx` 实测：输出**保留全部** `interface`/`type`/`as`/参数注解/返回类型/`import type`，其中 **148 个（74%）** 的输出用不含 TypeScript 插件的解析器无法解析。浏览器 `import()` 这样的模块会直接 `SyntaxError`。
2. **所以 Babel 现在承担的不是"重复解析"，而是类型擦除 + 循环预算注入**，这两件事 Rust 侧都没有。替换它不是删除冗余，是给 Rust 补两个功能。
3. **但有一处真正的冗余**：`preview.ts:90` 在 Babel 已经产出代码后，又用 `@babel/parser` 解析一遍，只为拿到 import/export 语句的位置。这些位置 Babel 的 AST 里本来就有。这一处可以消除，收益是**每模块省一次解析**，且不涉及任何语义变更。
4. **另有一个被忽略的成本**：`@babel/parser` 占 `playground-engine` chunk 的 **93.1%**（450,507 / 455,217 B）。它进首屏，而 `@babel/standalone` 是动态导入、不在首屏。真正的首屏解析器成本是这 450 KB，不是那个 2.2 MB。

---

## 1. 实测数据

### 1.1 解析次数（实测，非估算）

同一份 TSX 文本在编辑器一次运行中触碰的解析器：

| 阶段 | 解析器                        | 位置                                   | 触发条件                         |
| ---- | ----------------------------- | -------------------------------------- | -------------------------------- |
| A    | Oxc（Rust/WASM）              | `lower.rs:77`                          | 总是                             |
| B    | `@babel/parser`（原始 TSX）   | `analysis.ts:27`，经 `compiler.ts:290` | 总是                             |
| C    | `@babel/parser`（HMR 分类）   | `hmr.ts:226`、`133`                    | 仅 `hmr: true`，且前后版本有差异 |
| D    | Babel core（Rust 输出）       | `preview.ts:211`                       | 首次预览                         |
| E    | `@babel/parser`（Babel 输出） | `preview.ts:90`                        | 首次预览                         |

实测计数（用包装后的 `@babel/parser` 计数，行为不变）：

- `compileProject` 3 模块、`hmr: false` → **3 次**
- `createPlaygroundPreview` 3 模块 → **3 次**
- 编辑器一次完整编译（DOM + SSR + preview）→ **9 次** `@babel/parser.parse`，约 170 ms

### 1.2 各阶段产物与消费者

| Parse | 产出                       | 下游实际使用                                                                         | 可否消除                                                                |
| ----- | -------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| A     | `ModuleIr` + 生成代码      | 编译本体                                                                             | 不可                                                                    |
| B     | `PlaygroundModuleImport[]` | **只用 `specifier` 和 `typeOnly`**；`start`/`end`/`kind` 在 `compiler.ts` 中从未读取 | 可（Rust 已解析同一文件，`import type` 已在 `lower.rs:228/269` 读取过） |
| C     | 分类标签                   | 仅 UI 诊断文本，**不决定状态保留**（`hmr.ts:26-30` 明确）                            | 可退化或改由 Rust 提供                                                  |
| D     | 去类型 + 循环预算          | 沙箱执行的最终代码                                                                   | 需 Rust 补能力                                                          |
| E     | import/export span         | 仅用于占位符改写                                                                     | **可直接消除**（D 的 AST 已有）                                         |

### 1.3 体积（实测，vite 8.3.4 构建产物）

| 产物                                      |              raw |    gzip |  brotli | 首屏？             |
| ----------------------------------------- | ---------------: | ------: | ------: | ------------------ |
| `babel-*.js`（`@babel/standalone` 8.1.1） |        2,207,248 | 556,882 | 377,502 | **否**（动态导入） |
| `zeus-compiler-*.wasm`                    |        1,545,997 | 472,437 | 339,125 | 首次编译           |
| `playground-engine-*.js`                  |          455,217 | 117,753 |  92,089 | **是**             |
| └ 其中 `@babel/parser@8.0.0`              | 450,507（93.1%） |       — |       — |                    |
| `main-*.js`（外壳）                       |          138,839 |  39,222 |  33,192 | 是                 |

**关键纠正**：把"Babel 2.2 MB"当作首屏成本是错的。它不在首屏。首屏里真正的解析器成本是 `playground-engine` 那 455 KB，其中 93.1% 是 `@babel/parser`。

### 1.4 循环预算的实际行为（实测）

| 断言                            | 有没有测试                                                                    | 实测结果                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 生成的代码含预算逻辑            | 有（`preview.spec.ts:107-116`，仅断言字符串存在）                             | 通过                                                                                                  |
| 跑飞会被杀                      | 有，但**不在常规 CI**（`product-acceptance.yml`，仅 release 分支 / dispatch） | `while(true)` 1,003 ms 后抛出                                                                         |
| 异步有界循环不误杀              | **无**                                                                        | **误杀**：`while (n<10) { await sleep(150) }` 在 1,059 ms 抛出                                        |
| 修补 `performance.now` 无法绕过 | **无**                                                                        | **可绕过**：`performance.now = () => 0` 后无限循环无法被预算打断                                      |
| 非块体循环不导致编译失败        | **无**                                                                        | **失败**：`if (c) while (true) {}` 报 "Can't convert array path to a block statement"，整个预览不可用 |

---

## 2. 方案比较

### 方案 A：让 Rust 编译器做类型擦除 + 循环预算，移除 Babel

**工作量**：高。

- 类型擦除：需要 JS printer（当前 `Cargo.toml` 无 `oxc_codegen`/`oxc_transformer`）。NOT DETERMINED：引入后 wasm 体积增加多少。
- 循环预算注入：等价实现 + 保持 UTF-16 偏移与 sourcemap 一致。
- 移除 `@babel/standalone` 100% 的下载（Brotli 377 KB）与 `@babel/parser`（Brotli ~76 KB）。
- **但 `@babel/parser` 仍要保留**，除非同时让 Rust 输出 import edges（方案 B）。

**风险**：类型擦除的语义边界极多（`enum`、`namespace`、参数属性、`declare`、`satisfies`、泛型默认值）。任何一处不一致都会让用户代码静默变成不同语义 —— 这比体积重要得多。

**结论**：**不值得为之单独立项。** 收益（首次编译省 377 KB Brotli）确实存在，但为了它重写类型擦除并承担语义风险，性价比低于下面两件小事。

### 方案 B：Rust 输出 import edges，消除 Parse B 与 Parse E

**工作量**：中。

- `TransformModuleResult` 增加 `imports: {specifier, typeOnly}[]` —— `lower.rs:228/269` 已经在读 `import type`。
- `preview.ts` 不再需要 Parse E，因为改写所需的 span 可以在 Rust 输出里带上（或让 Rust 直接输出占位符）。
- 移除 `@babel/parser` 后，`playground-engine` chunk 从 455 KB 降到约 **5 KB**。

**收益**：首屏省约 450 KB raw / ~117 KB gzip / ~92 KB Brotli。这是**首屏**成本，比方案 A 省的是首次编译成本，位置更关键。
**风险**：中。需要保持 `analysis.ts` 的 `kind`（local/external/runtime/style）判定与 Rust 一致。
**这是本 RFC 推荐的第一个动作。**

### 方案 C：修复循环预算的四个缺陷（与 Babel 去留无关）

**工作量**：低。

- 非块体循环导致编译失败 → 先 `ensureBlock()` 再 `insertBefore`。
- 异步循环被误杀 → 预算只计同步耗时，或用 `Atomics.wait` 之外的方式判定。
- `performance.now` 可覆盖 → 先用闭包捕获原始函数。
- 把这个 e2e 移进常规 CI。

**收益**：不是体积，是**正确性与安全**。一个能被绕过的 CPU 保护、和一个会杀掉合法代码的保护，都比没有更糟。
**这是本 RFC 推荐的第二个动作 —— 且优先级高于任何体积优化。**

### 方案 D：保留现状，只做微小清理

移除 `analysis.ts` 中无人消费的 `start`/`end`/`kind` 字段，消除 Parse E。

**收益**：小（省一个解析器每模块一次，约 20 ms/编译）。**风险**：极低。

---

## 3. 建议

按收益/风险比排序：

| 优先级 | 动作                                                 | 类型          | 收益                                       |
| ------ | ---------------------------------------------------- | ------------- | ------------------------------------------ |
| **1**  | **方案 C：修循环预算四缺陷 + 进 CI**                 | 正确性 / 安全 | 不是性能，是防住一个可绕过的保护和一个误杀 |
| **2**  | 方案 B：Rust 输出 import edges，消除 `@babel/parser` | 首屏体积      | ~450 KB raw / ~92 KB Brotli 首屏           |
| **3**  | 方案 D：清理 `analysis.ts` 死字段                    | 可维护性      | 每编译省一次解析                           |
| 4      | 方案 A：Rust 做类型擦除，移除 Babel                  | 首次编译体积  | 377 KB Brotli，但风险高、工作量大          |

**不建议做的**：以"Babel 太大"为理由直接替换。数据说明它不在首屏，且它承担的职责无处转移。

---

## 4. 未确定事项

以下问题本 RFC 无法回答，需要单独测量：

1. 引入 `oxc_codegen` 后 wasm 体积增加多少 —— 未测量。
2. `@babel/standalone` 能否只打包 `plugin-transform-typescript` + `core` 的精简组合，能省多少 —— 未测量（standalone 是预打包整包，无细粒度入口）。
3. `compiler-native`（napi）与 wasm 是否可以共用一份 import edges 逻辑而不增加复杂度 —— 未评估。

明确标注：以上均为 `NOT_RUN`，任何"可再省 X%"的说法在测量前不成立。
