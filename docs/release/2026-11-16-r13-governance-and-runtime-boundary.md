# Zeus R13 — 发布治理加固与运行时依赖边界

日期：2026-11-16
范围：Core `baicie/zeus`（UI 无需配套改动）
判定：**NO_GO**（剩余阻断项见 §7）

---

## 1. 基线

| 项                | 值                          |
| ----------------- | --------------------------- |
| Core main（开始） | `a786aebb`                  |
| UI main（开始）   | `89fc93ca`                  |
| 根 `package.json` | `0.1.1-beta.20`（本轮未改） |
| Cargo workspace   | `0.1.1-beta.0`（本轮未改）  |
| 开放 PR（开始）   | 0                           |

---

## 2. R13-1：发布治理正确性

### 2.1 错误 PASS 已消灭

旧实现问的是「环境够不够宽以部署 release tag」。于是**越放宽越安全**：

```
refs/tags/v*   PASS
refs/tags/*    PASS
*              PASS
```

不变量是反的：**环境允许的每个 ref 都必须在授权集合内**。

三个数据模型错误让错误答案无法避免：

| 错误              | 后果                                                           |
| ----------------- | -------------------------------------------------------------- |
| `name` 被当成 ref | 它是 **pattern**（`v*`）。拿 `refs/tags/v*` 比对是两种语言在比 |
| `type` 被丢弃     | `branch`/`tag` 是唯一锚定命名空间的字段                        |
| 规则叠加          | 其他命名空间的条目即使永不匹配 tag，也实际放宽了环境           |

**依据**：GitHub 官方 REST 文档确认 `deployment-branch-policies` 返回 `{id, node_id, name, type}`，`type ∈ {branch, tag}`，`name` 是 pattern。另一份文档确认「通配符不匹配 `/`」且匹配遵循 Ruby `File.fnmatch`——但**没有枚举全部语义**。

后者是本轮的关键判断：既然语义无法完全确定，就不假设 pattern 是窄的。只建模 `<literal>` 与 `<literal>*`；`?`、`[`、`{`、`**`、非末尾 `*` 一律判 **unbounded**，按「放行一切」计算。

**安全与可用性分开**：安全判定覆盖全部条目；可用性只问「是否存在某合法形态 tag 能部署」。具体候选的可用性是独立函数 `evaluateCandidateReachability`，因为答案随每次发布变化，不能写进长期记录。

### 2.2 环境拓扑拆分

六个 workflow 共用 `environment: Release`，其中四个从 `main` 跑：

| workflow                   | 触发                                      | 旧 `GITHUB_REF`                |
| -------------------------- | ----------------------------------------- | ------------------------------ |
| `release.yml`              | push on `v*`                              | `refs/tags/v*`                 |
| `rc-approval.yml`          | workflow_dispatch                         | `refs/heads/main`              |
| `release-governance.yml`   | workflow_dispatch                         | `refs/heads/main`              |
| `repair-dist-tags.yml`     | workflow_dispatch                         | `refs/heads/main`              |
| `repair-native-latest.yml` | workflow_dispatch                         | **显式断言 `refs/heads/main`** |
| `devtools-release.yml`     | push on `create-zeus@*` / `vite-plugin@*` | 其他 tag                       |

tag-only 策略会让五个无法部署，而「为了让它们能跑就放宽策略」正是规则要防的绕过。

按**一个 job 能改什么**拆分：

| environment           | 准入                                 | secrets                 | 发布新版本 |
| --------------------- | ------------------------------------ | ----------------------- | ---------- |
| `Release`             | tag `v*`                             | `NPM_TOKEN`             | **是**     |
| `RC Approval`         | branch `main`                        | 无                      | 否         |
| `Release Governance`  | branch `main`                        | `ZEUS_GOVERNANCE_TOKEN` | 否         |
| `Release Maintenance` | branch `main`                        | `NPM_TOKEN`             | 否         |
| `Devtools Release`    | tag `create-zeus@*`, `vite-plugin@*` | `NPM_TOKEN`             | 是         |

**Administration 权限的 token 只存在于一个环境。**

五个 workflow 文件已迁到各自环境；`check:environment-topology` 拿契约表校验文件，并断言 governance token 只在一个环境里。

**门禁实测**：手动把 `repair-dist-tags.yml` 改回 `Release`，门禁报 `declares Release but the contract says Release Maintenance` 并退出 1。

### 2.3 自审批检查（含真实局限）

审批文档由审批人自己 dispatch 的 run 产出，所以「审批人签了它」是同义反复。现在文档记录 `requester`，验证器在三种情况下拒绝：requester 等于审批人、requester 缺失、requester 非字符串。

**必须如实记录的局限**：`requester` 是**自我声明**的输入，GitHub API 没有任何独立来源能证明「谁请求了这次发布」——因为审批发生在打 tag 之前。有意的审批人可以填别人的名字。

所以这是**防误操作**，不是密码学意义上的分离。防蓄意内鬼靠的是环境的 required reviewers，它把**另一个 GitHub 身份**绑定到部署上。这条局限已写进 `rc-approval.ts` 的注释，而不是让读者以为检查比实际更强。

---

## 3. R13-2：运行时依赖边界

### 3.1 实测证据

按子路径独立进程加载、比对 `require.cache`：

| 入口                            | 模块数 | 体积     | typescript |
| ------------------------------- | ------ | -------- | ---------- |
| `output-react-wrapper` `.`      | 108    | 28.35 MB | **是**     |
| `output-react-wrapper/runtime`  | 1      | 0.01 MB  | 否         |
| `output-react-wrapper/renderer` | 9      | 1.10 MB  | 否         |

三个构建工具只被 `.` 入口 import，而 `.` 是**构建期插件**。`/runtime` 零 import。

### 3.2 修法

三个构建工具从 `dependencies` 移到 optional `peerDependencies`（该包本来就这样处理 `react`、`react-dom`、`@zeus-js/web-c-runtime`）。

**没有拆包**。我先验证了拆包方案（runtime-only 包），但改动更小、风险更低的方案已能达到同样效果：`/runtime` 本来就不 import 构建工具，问题只在依赖声明。拆包会新增一个发布包和一条 UI 依赖规则，收益不抵成本。

### 3.3 量化对比

装**一个** `@zeus-web/button`（真实 registry tarball）：

| 指标                         | Before                           | After  |
| ---------------------------- | -------------------------------- | ------ |
| 包数量（pnpm store）         | 42                               | 12     |
| `node_modules` 体积          | 31 MB                            | 2.3 MB |
| tarball 数量（wrapper 自身） | 1                                | 1      |
| 浏览器 JS bundle             | 59.2 kB + 2.8 kB（Vite 7，未变） | 同左   |
| TypeScript 进入依赖树        | **是（24 MB）**                  | **否** |
| compiler-native 进入依赖树   | 是                               | **否** |

纯 wrapper 消费者（不装 UI 包）：**42 包 / 31 MB → 4 包 / 8.3 MB**。

### 3.4 兼容性

| 项                     | 结果                                                                      |
| ---------------------- | ------------------------------------------------------------------------- |
| `.` 入口（构建期插件） | 声明 peer 后可用；未声明时 `ERR_MODULE_NOT_FOUND`，**不静默产出错误结果** |
| `/runtime`             | 零 import，无构建工具时正常创建组件                                       |
| `/renderer`            | 未改                                                                      |
| 导出路径 / 公开类型    | 未改                                                                      |
| Vite 7                 | `<zw-button>` 在 Firefox 与 WebKit 挂载成功，零页面错误                   |
| Vue 消费者             | 零 TypeScript                                                             |
| peer 警告              | 无（只有 esbuild 自己的构建脚本警告）                                     |

---

## 4. R13-3：安全版本演练

### 4.1 默认 dry-run

CLI 此前无条件调用 `applyVersionRehearsal`——这正是误改真实 `main` checkout 的方式。现在 `--apply` 必须显式给出；不给出时收集计划、打印每处编辑、**不写树**。

`--apply` 先过守卫：必须是 git worktree、**不能是 detached HEAD**、分支不是 `main`、工作区干净。dry-run 跳过全部（否则迭代时安全模式不可用）。

**detached HEAD 这条是我在自查时补上的。** 第一版守卫用 `git rev-parse --abbrev-ref HEAD` 取分支名再比对 `main`，但这个命令在 detached checkout 上返回字面量 `HEAD`——它不等于任何分支名，于是**放行**。而 `git checkout <sha>` 正是发布演练的起点。

实测：

```
cd /tmp/gh1 && git checkout --detach HEAD
reviewApplyGuard('/tmp/gh1')  ->  undefined   (放行)
```

补上后的行为：

```
reviewApplyGuard('/tmp/gh1')  ->  "has a detached HEAD; a version switch must land on a named branch"
```

新增测试在旧守卫下失败、新守卫下通过。

### 4.2 原子写入

旧实现循环 `writeFileSync`。中途失败会留下部分包已升级、部分未升级，且没有记录哪些。现在：

1. 先把每个新内容写入同级临时文件——暂存失败不碰任何目标
2. 用 `rename` 提升（同一文件系统内原子）
3. 后续提升失败时，把已经落地的文件恢复为原始内容
4. 恢复本身失败时报告 `rolledBack: false`，而不是声称成功

`applyVersionRehearsal` 在任何失败时抛错，而非返回部分报告——分不清「全写了」和「写了一部分」的调用方会把两者都当成功。

三个文件系统操作是可注入的，所以回滚路径通过让**真实操作失败**来测试，不是断言 mock 的调用次数。

### 4.3 实测

| 场景                          | 结果                                       |
| ----------------------------- | ------------------------------------------ |
| dry run 写盘                  | 40 文件 / 49 编辑报告，`package.json` 未变 |
| `--apply` 到非 git 目录       | 拒绝                                       |
| `--apply` 到干净 `main` clone | 拒绝                                       |
| `--apply` 到脏工作区          | 拒绝                                       |
| `--apply` 到干净候选分支      | 写入；第二次运行 0 编辑                    |
| 提升中途失败                  | 已落地文件全部恢复                         |
| 回滚失败                      | `rolledBack: false` + `rollback failed`    |
| detached HEAD                 | 拒绝                                       |

28 项演练测试（14 原有 + 14 新增）。

---

## 5. R13-4：消费者回归门禁

### 5.1 为什么必须新增

`check:packed-consumers` **故意安装** `typescript`、`vite`、`rollup`——它验证构建工具能用。一个安装了自己要找的东西的门禁，无法发现它被动出现，所以没人注意到装一个 UI 组件会拉进 24 MB TypeScript。

`check:runtime-boundary` 打包 wrapper，把它装进一个只有 React 的项目（所有 optional peer 都不声明），断言：

- 六个构建工具均未进入依赖树
- 只装运行时包
- `/runtime` 无构建工具时能创建组件
- `.` 入口无构建工具时报模块缺失，而非静默产出

**正向检查与负向同样重要**：静默失败的安装树里也没有构建工具。

### 5.2 反向验证

| 实现        | 结果                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------- |
| 旧 manifest | **FAIL** — 36 包，5 个构建工具（typescript、bundler-plugin、component-analyzer、component-dts、compiler-native） |
| 新 manifest | PASS — 4 包                                                                                                      |

### 5.3 CI 接线

两个门禁接入 `lint-and-check`（冷启动约 4 秒），拓扑门禁同时接入 release precheck。

---

## 6. 测试

| 套件                                                      | 结果                                                |
| --------------------------------------------------------- | --------------------------------------------------- |
| `scripts/release/` + `scripts/check/`                     | **901 通过**，15 跳过                               |
| 策略（新）                                                | 41 项；旧实现下 **29 项失败**                       |
| 拓扑（新）                                                | 21 项                                               |
| 演练写入（新）                                            | 13 项                                               |
| 审批                                                      | 27 项                                               |
| `tsc --noEmit`                                            | 通过                                                |
| `check:workflows`                                         | 19 个 workflow 结构通过                             |
| `check:exports` / `check:cjs` / `check:release-artifacts` | 32 包通过                                           |
| UI 配对                                                   | `0.1.0-beta.35@89fc93ca vs Core 0.1.1-beta.20` PASS |

---

## 7. 剩余 NO_GO

### 需要维护者配置（代码已就绪）

1. **创建五个新环境并配置保护**：`RC Approval`、`Release Governance`、`Release Maintenance`、`Devtools Release`，以及现有 `Release` 的 required reviewers / prevent self-review / 取消 admin bypass / `v*` tag policy。
   **未创建前，这五个 workflow 会因环境不存在而无法部署。** 这是本轮引入的操作性前置条件，必须与代码同步上线。

2. 创建 `ZEUS_GOVERNANCE_TOKEN` 到 `Release Governance` 环境，`NPM_TOKEN` 到 `Release` / `Release Maintenance` / `Devtools Release`。

3. 决定 UI `0.1.0-beta.35`：补 tag 或直接切 RC。

4. 授权切 `0.2.0-rc.0`。

### 平台限制（无法解决）

5. **`requester` 无法独立验证**（§2.3）。防误操作可以，防蓄意绕过不行。真正的分离依赖 required reviewers。

### 需要真实环境验收

6. **新的环境拓扑从未真实运行过**。本地只能校验文件与契约一致，无法校验 GitHub 是否接受这些 `workflow_dispatch` 部署。

7. cross-platform / stage-2 / approval / rollback 证据仍缺。

### 本轮未做

8. 没有修改任何 GitHub 环境、secret、variable（任务禁止）。
9. 没有在 UI 仓产生任何提交（无需配套改动）。
10. 没有实现 R13-4 要求的完整环境矩阵（Node 22/24、Chromium、React 18）——本机条件限制，已如实记录。

---

## 8. 下一步（R14）

1. **先创建五个环境并配置保护**，否则 R13 的 workflow 迁移不可用。
2. 在真实环境上跑一次 `RC Approval` + `Release Governance`，验证部署被接受。
3. 0.2.0 RC Cut（待 ENV 与授权）。
4. Terminal / OpsWeave 真实宿主集成。
5. 0.2.1：把 DEP-1 的剩余面（`web-c`、`output-wc`、`output-icons`、`playground-engine` 仍把 TS 声明为 dependency）按同样方式收敛。本轮只修了消费者实际会装到的 wrapper。
