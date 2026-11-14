# Release Canary 队列与竞态分析

日期：2026-11-15  
基线：Core `96ceb447`  
范围：`.github/workflows/release-canary.yml`、`scripts/release/verify-main-head.ts`

---

## 1. 问题

连续合并时，Release Canary 会先排队、再完整编译七平台、最后才发现提交已过期。

实测（上一轮，run #322–#330）：

| 项                | 值                                                   |
| ----------------- | ---------------------------------------------------- |
| 连续失败数        | **9**                                                |
| 失败位置          | 全部在 `canary-dry-run` 的 `Verify main source head` |
| 七平台编译结果    | **每次 7/7 success**                                 |
| native 编译纯浪费 | **140.9 job-min**（≈ 11 计费小时）                   |

失败原因全部是同一句：

```
Error: Workflow SHA <sha> is stale; origin/main is <newer-sha>
```

## 2. 根因在依赖图

```
release-preflight
  └─ native-prebuild（七平台矩阵）
       ├─ canary-dry-run      ← stale 检查在这里
       └─ release-canary
```

`verify-main-head.ts` 的全部 imports：

```ts
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
```

它执行的命令只有 `git ls-remote --exit-code origin refs/heads/main` 和 `git rev-parse HEAD`。
**不依赖任何原生产物、任何浏览器、任何构建输出。**

## 3. 修复

在 `release-preflight` 增加同名步骤：

```yaml
- name: Verify main source head
  if: github.ref == 'refs/heads/main'
  run: pnpm release:verify:main-head
```

### 3.1 为什么放在 `pnpm install` 之后

`pnpm release:verify:main-head` 走 npm script → `tsx`，而 `tsx` 是 devDependency。
`setup-node` 的 `cache: 'pnpm'` 缓存的是 pnpm store，不创建 `node_modules`。

放在 install 之前会直接失败。放在之后仍能省下的是**七平台编译**（约 16 分钟），
这才是浪费的主体；install 本身约 30 秒。

**这是一个有意识的取舍，不是疏忽。**

### 3.2 为什么保留晚期检查

早期检查只能看到「preflight 启动时的 main」。从那一刻到 `canary-dry-run` 实际打包之间，
仍可能有人推 main。**那个窗口正是晚期检查关闭的。**

删掉晚期检查会让 TOCTOU 窗口重新打开。任务明确要求不得为了更快而删除它。

### 3.3 为什么带 `if: github.ref == 'refs/heads/main'`

`release-preflight` 的 job 条件是「main **或** dry-run」。`workflow_dispatch mode=dry-run`
允许在 release 分支上运行，而那种场景永远满足不了「必须是 main HEAD」。

**加同一个 `if` 保留了既有行为**：非 main 的 dry-run 跳过检查，继续走 dry-run。

## 4. 队列设计（任务第 7 点）

### 4.1 事实

`group: npm-release` 被**四个**工作流共用：

| 工作流                     | 用途                   |
| -------------------------- | ---------------------- |
| `release.yml`              | 真正的 npm 发布        |
| `release-canary.yml`       | dry-run 与 canary 发布 |
| `repair-native-latest.yml` | dist-tag 修复          |
| `repair-dist-tags.yml`     | dist-tag 修复          |

配置：

```yaml
concurrency:
  group: npm-release
  cancel-in-progress: false
  queue: max
```

### 4.2 这个设计是对的

三个会发布的工作流共享一个队列，是**正确且必要**的：两个 npm publish 绝不能交错。

### 4.3 但它有一个真实代价

**每次 push 到 main 都会排一个 dry-run，挡在人工触发的正式发布前面。**

`cancel-in-progress: false` + `queue: max` 意味着不取消、全部排队。上一轮 11 次合并
产生了 11 个 canary run，串行跑完需要数小时。

### 4.4 是否应分开队列

| 方案                              | 优点                           | 代价                                                                                    |
| --------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| **A. 保持共用**（现状）           | publish 之间绝不交错，语义最强 | dry-run 会延迟人工发布                                                                  |
| **B. dry-run 用独立队列**         | 人工发布不被 dry-run 阻塞      | 需要保证两个队列不会同时 publish                                                        |
| **C. `cancel-in-progress: true`** | 后一个 push 取消前一个         | **失去「每个提交都被验证」的保证**；且若 publish 也在同组，会取消运行中的发布——**危险** |

### 4.5 推荐

**保持现状，不做修改。**

理由：

1. 本轮已把 stale 的代价从「七平台编译」降到「一次 install + 一次 ls-remote」；
2. 方案 B 的收益（人工发布更快）只在「合并风暴期间同时要发布」时成立，而这种组合本身
   就应该避免；
3. 方案 C 在同组含 publish 的前提下**不安全**。

**任务第 8 点要求「提出队列优化方案，但不擅自修改 `cancel-in-progress` 的安全语义」——本文件即该方案，未改任何并发配置。**

## 5. 测试

`scripts/release/__tests__/canary-early-head.spec.ts`（8 项）：

| 用例                        | 断言                                       |
| --------------------------- | ------------------------------------------ |
| preflight 有 head 检查      | 存在名为 `Verify main source head` 的 step |
| 位置正确                    | 在 install 之后、audit 之前                |
| 晚期检查仍在                | `canary-dry-run` 保留同名 step             |
| 两个检查条件一致            | 都带 `if: ... refs/heads/main`             |
| `cancel-in-progress: false` | 未被改动                                   |
| `queue: max`                | 未被改动                                   |
| canary 与 release 同组      | 两个工作流都声明 `group: npm-release`      |

`scripts/release/__tests__/verify-main-head.spec.ts`（新增 8 项，共 11 项）覆盖完整决策表：
当前 main 通过、旧 SHA 拒绝、非 main 拒绝、缺失 SHA 拒绝、非法 SHA 拒绝、
checkout 不符拒绝、事件类型受限、大小写不敏感、**早期通过后 main 变化必须被晚期拒绝（TOCTOU）**。

## 6. 未做

| 项                                      | 原因                         |
| --------------------------------------- | ---------------------------- |
| 实际触发一次 stale 的 canary 验证新行为 | 需要推 main，本轮禁止        |
| 修改 `cancel-in-progress`               | 任务明确禁止擅自改其安全语义 |
| 拆分队列                                | 见 §4.5，推荐保持现状        |

**因此「过期提交不再浪费完整七平台构建」这条验收，本轮是静态证明（依赖图 + 步骤位置），
不是运行证明。** 待下一次 main push 时才能实测。
