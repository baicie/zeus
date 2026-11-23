# R24 TASK 19 — R23/R24 交付物去重审计

生成时间：2026-11-23
**结论分三类：KEEP BOTH（测不同维度）/ MERGE（可合并）/ DELETE ONE（被完全覆盖）。**

审计范围：本轮两批工作新增的 check 与 drill 脚本。判断标准不是「代码像不像」，
而是**删掉其中一个会不会丢失一个维度**。

---

## 1. 判定总表

| #   | 对照                                                                       | 判定                                  |
| --- | -------------------------------------------------------------------------- | ------------------------------------- |
| 1   | `check-hydration-cycles-browser` vs `check-nested-scopes-browser`          | KEEP BOTH                             |
| 2   | `check-ssr-marker-matrix` vs `check-nested-hydration-browser` 内的标记断言 | MERGE（删浏览器侧那份）               |
| 3   | `check-compiler-parity` vs `compiler-wasm/__tests__/parity.test.mjs`       | DELETE ONE（`check-compiler-parity`） |
| 4   | `check-nested-binding-browser` vs `check-nested-hydration-browser`         | KEEP BOTH（判定已下调，见 §4）        |
| 5   | `check-node-ssr-consumer` vs `check-vite-show-branch-consumer`             | KEEP BOTH（SSR 半边可共享）           |
| 6   | `check-node-ssr-consumer` vs `check-node-compat-matrix`                    | KEEP BOTH                             |
| 7   | `run-release-group-drill` vs `run-latest-policy-drill`                     | KEEP BOTH                             |
| 8   | `delivery-readiness` vs `audit-release-group`                              | KEEP BOTH（前者当前无调用方）         |

---

## 2. 已在本轮执行的修改

| 项                                        | 动作                                                |
| ----------------------------------------- | --------------------------------------------------- |
| `drill:release-group` 重复声明            | **已删**（`package.json` 里同一键同一命令出现两次） |
| `check-nested-binding-browser` 的全局变量 | **已修**，见 §4                                     |

---

## 3. 建议合并但尚未执行的项

刻意**不在本轮执行**：这些改动会删除或重塑已验证的检查，属于独立决策，
不适合夹在一个已经很大的 PR 里。

### 3.1 `check:ssr-marker-matrix` 吸收浏览器侧的标记断言

`check-nested-hydration-browser` 里的「标记 id 不重复」是对 SSR HTML 的纯字符串
分析，从不接触 DOM —— 浏览器、三引擎、hydration 都不给它任何额外信息，
而矩阵版本覆盖**所有** open marker（`cN.eN`/`cN.sN`/`cN.fN`/`cN.tN`），
不只是 `cN.root`，还额外校验配对与嵌套。

**做法**：把 `App → Child → Show → Grandchild` 这个形状加进矩阵的 `CASES`
（矩阵目前唯一缺的形状），然后删掉浏览器检查里的那一段。

### 3.2 `check:compiler-parity` 并入 `parity.test.mjs`

`packages/compiler/compiler-wasm/__tests__/parity.test.mjs` 已在做同一件事，
且更强：60+ 模块语料（实测 `corpus.length > 60` 有断言），比较整个
`TransformModuleResult`。CI 里两个步骤还在同一个 job 相邻执行。

**唯一独有维度**：`check-compiler-parity` 传 `autoHydrate: true`，
而 parity 语料从未设这个变体（已核验：该文件里没有 `autoHydrate`）。

**做法**：给 `parity.test.mjs` 加一个 `autoHydrate: true` 变体，然后删掉
`check:compiler-parity`。保留它意味着在同一个 job 里把同两个二进制跑两遍，
只为多一个 flag。

### 3.3 共享 helper

| helper                   | 作用域内副本    | 仓库内副本 | 建议                                      |
| ------------------------ | --------------- | ---------- | ----------------------------------------- |
| `platformPackage()`      | 3（逐字节相同） | **8**      | 提取到 `scripts/check/native-platform.ts` |
| candidate archive 读取   | 3               | 7          | 提取 `readCandidates(root)`               |
| `NEEDED` 列表            | 3（两种变体）   | 5          | 提为两个常量                              |
| Verdaccio 启动/注册      | 2（逐字节相同） | 4          | 提取 `scripts/release/verdaccio.ts`       |
| install/browser/报告骨架 | 2               | 4          | **不提取**（框架化会更难读）              |

值得提取的理由不是「重复难看」，而是**副本已经漂移并造成过真实漏洞**：
`check-node-compat-matrix` 的副本**从不校验 `candidates.schema`**，
也不对 archive 做 `fs.existsSync`。这类数据（平台包名、发布组、服务地址）
漂移会静默改变「被测的东西是什么」。

---

## 4. `check-nested-binding-browser`：从「完全被覆盖」改判为 KEEP BOTH

审计最初的判定是 DELETE ONE —— 逐条比对后，`nested-hydration` 的断言**严格更强**：
身份保持（不是布尔 map）、节点存活、scope 释放、交换 root 标记的反事实，
`nested-binding` 都没有等价物；而它仅有的两个额外项只 `console.log`、从不断言。

**但审计同时发现了一件更要紧的事**：它的 fixture 重新引入了刚修掉的那个缺陷。

```js
const signals = (window.__probeSignals = (() => { … })())
```

这份源码编译两次（SSR + 客户端），两份都执行该赋值，**后加载的赢**。
页面里 SSR 模块在前、客户端模块在后，所以全局恰好指向客户端副本 ——
检查通过靠的是**两条 import 的相对位置**。

**反事实**（已实测）：只交换那两行 import，`PASSED` → `FAILED`，
被测代码一字未改。一个检查因为两行 import 换位置就改判，它测的是 import 顺序。

**已修**：fixture 改为导出，页面按名导入，并加守卫
`CONTROL_SIGNAL_NOT_BOUND_TO_DOM`。三种验证：
默认顺序通过、反向顺序通过、把控件指向 SSR 副本则带该错误码失败。

**判定因此改为 KEEP BOTH**，理由不再是「对照价值」，而是这两点：

1. 它现在测的是一个**结构不同**的树（每个组件各自持有绑定，而非 props 下传）；
2. 它作为**检查工具自身**的回归测试存在 —— 它复现过两次同一类缺陷，
   修好之后的版本是「这类 fixture 应该长什么样」的活样例。

若将来要削减 CI 时间，删它而不是删 `nested-hydration` 是安全的；
但那是一次独立决策，不是本轮能顺手做的。

---

## 5. 未修改但记录在案

- `delivery-readiness.ts` **没有任何调用方**（只有它自己的单测）。不是重复，
  是未接线 —— 它要等发布链路真的调用它才有意义。
- `run-release-group-drill` 自己实现了 `publishedNames()` / `distTags()`，
  而 `audit-release-group.ts` 的 `auditGroup(version, registry, group)` 已能接受
  任意 registry。合并还能带来 drill 目前缺的「E404 vs 查询失败」区分。
- `run-isolated-registry-drill` 已经断言过「首发夺走 latest」，
  与 `run-latest-policy-drill` 第一条场景同claim（本轮范围外）。

---

## 6. 判定

```
TASK_19: COMPLETE
本轮实际删除:      1（package.json 重复键）
本轮实际修复:      1（nested-binding 的全局变量 fixture）
建议但未执行:      2 处合并 + 4 处 helper 提取
```

**不执行 3.x 的理由**：删检查、改 CI 结构、动 7 个文件的 helper 提取，
每一件都会让「刚刚被验证为绿的东西」重新变成未验证。把它们留在
这份文档里，比塞进一个已含 24 个文件变更的 PR 更负责。
