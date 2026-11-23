# rc.4 发布准备：做到哪一步，卡在哪

- 日期：2026-11-23
- 结论：**rc.4 的版本切换已就绪，但不能靠重打一个 tag 解决**
- 关键发现：`v0.2.0-rc.3` 的 tag 指向一棵**不含六域重构**的树

## 1. v0.2.0-rc.3 的 tag 指向错误的历史点

| 事实                                                                | 证据                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `v0.2.0-rc.3` 是 annotated tag，指向 `649e2f60`                     | `git cat-file -t` = tag；`rev-parse v0.2.0-rc.3^{commit}` |
| `649e2f60` 的提交信息是「switch the tree to 0.2.0-rc.3」（#324）    | `git log -1 649e2f60`                                     |
| 该提交的树里 `packages/` 只有 `core`、`create`、`devtools`、`web-c` | `git ls-tree v0.2.0-rc.3:packages`                        |
| **没有 `compiler`、`features`、`tooling`**                          | 同上                                                      |
| 六域重构 `d3b52f8e`（#325）**不在** `649e2f60` 的祖先链上           | `git merge-base --is-ancestor d3b52f8e 649e2f60` → 否     |
| `d3b52f8e` 在 `649e2f60` 之后 1 个提交                              | `git rev-list --count 649e2f60..d3b52f8e` = 1             |
| `649e2f60` 距 `main` 有 68 个提交                                   | `git rev-list --count 649e2f60..main`                     |

**这意味着 rc.3 的发布是在六域重构之前的树结构上跑的。** 当时 `packages/compiler/`、`packages/features/`、`packages/tooling/` 都还不存在。

### 1.1 这解释了什么

- rc.3 的 `compiler-native` 在旧路径 `packages/compiler/...`？不——在那棵树上根本没有这个路径
- 但 rc.3 的 run `44447893463` 里，7 个 `native-prebuild` job 全部成功，说明它们用的是**另一棵树**
- 这指向一个可能：rc.3 的发布是从一个**当时的分支 tip** 跑的，而 tag 后来被指向了一个更早的提交

**UNKNOWN**：tag 是何时、被谁指向 `649e2f60` 的。`git reflog` 对 tag 无效，远端 tag 也没有历史。需要 GitHub 的 tag 创建记录才能确认（需 API 查 `git/refs/tags` 的创建时间，且它只给最后一次）。

## 2. 我做到哪一步

### 2.1 已完成

| 项                                                     | 状态                                           |
| ------------------------------------------------------ | ---------------------------------------------- |
| 32 个包版本切到 `0.2.0-rc.4`                           | ✅ 全部一致                                    |
| `meta/release/pairing/v0.2.0-rc.4.json`                | ✅ bootstrap + rc.3 的 recovery 记录           |
| `compiler-native/index.js` 的 `requireNative` 版本常量 | ✅ 52 处同步为 rc.4（`sync-native-loader.ts`） |
| `component-analyzer` 的 `mergeEvents` 修复             | ✅ 已合入分支（`2d7bc699`）                    |
| 分支名合规（`check:branch`）                           | ✅ `docs/audit-phase2-migration`               |

### 2.2 发现并修掉的一个真实错误

第一次跑 `release:version-packages 0.2.0-rc.4` 后，我用 `git checkout -- packages/compiler/compiler-native/index.js`
还原了它——**这是错的**。那个文件虽然被 git 追踪，但它是 `afterVersion` 钩子生成的产物，
里面硬编码了 6 处期望的原生包版本。

CI 因此报：

```
Native binding package version mismatch, expected 0.2.0-rc.3 but got 0.2.0-rc.4
```

用 `pnpm exec tsx scripts/release/sync-native-loader.ts 0.2.0-rc.4` 修复后，该错误消失。

**教训**：`compiler-native/index.js` 与 `compiler-native/index.d.ts` 是「被追踪的生成物」，
版本切换时必须跟着变，不能当构建噪声还原。

## 3. 为什么不能直接打 rc.4 的 tag

`release.yml` 由 `push tags: v*` 触发，然后：

1. `release:verify:tag-source --version 0.2.0-rc.4` 校验 tag 指向的树
2. 读 `meta/release/pairing/v0.2.0-rc.4.json`
3. `native-prebuild` 调 `compiler-native.yml`，其中每个平台跑
   `release:smoke:compiler --local-package <pkg>`

第 3 步当前会失败，我已在本地复现：

```
added 3 packages in 1s
Error: Cannot find native binding. npm has a bug related to optional dependencies
[cause]: Cannot find module './zeus-compiler-native.darwin-arm64.node'
```

**原因**：`compiler-native` 的 `optionalDependencies` 指向 `0.2.0-rc.4`，
而该版本此时**还没发布**。`npm install` 用三个本地 tarball 装，解析不到 optional 平台包就静默跳过，
于是 `requireNative` 找不到 `.node`。

**验证这是「首发特有」而非回归**：

- 用**已发布**的 `0.1.1-beta.20` 跑同一脚本 → **通过**（`Compiler install smoke passed (registry 0.1.1-beta.20)`）
- 所以 smoke 逻辑本身正确，只有「本地 tarball + 未发布版本」的组合会失败

**而 rc.3 当时能过**，是因为它跑在另一棵树上（见 §1）。

## 4. 我停在这里，没有继续做的事

| 动作                                        | 为什么没做                                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| 创建 `v0.2.0-rc.4` tag                      | tag 一旦推送就不可撤回（ruleset 禁止移动），且会立即触发一次注定在 smoke 阶段失败的发布 |
| 绕过 smoke（加 `continue-on-error`）        | 这正是设计包 `docs/06` 禁止的「用跳过冒充完成」                                         |
| 给 smoke 加 `--local-package` 的特殊分支    | 会削弱这个门禁的意义，需要单独评审                                                      |
| 在 `compiler-native.yml` 里改 fallback 逻辑 | 同上                                                                                    |

## 5. 三条可选路径

### A. 先发平台包，再发主包（小步快跑）

1. 先只发布 7 个 `@zeus-js/compiler-native-*` 平台包（它们没有 optional 依赖）
2. 再发布 `compiler-native` 主包 + 其余 24 个包

**代价**：要拆发布流程，`release:precheck` 与 `release.yml` 都要改。

### B. 让 smoke 支持「本地 tarball 组」（推荐）

`--local-package` 模式已经把 3 个 tarball 一起 `npm install`。
问题在于 `optionalDependencies` 里的其他 6 个平台包无法解析。

**改法**：在 `--local-package` 模式下，额外把**本平台对应的**那个平台包 tarball 也传给 `npm install`，
并用 `--omit=optional` 跳过其余。这样 smoke 验证的正是「本平台的 .node 能否被加载」——
与它的设计意图一致。

**代价**：改 `smoke-compiler-install.ts`，需要评审。收益是让首发可验证。

### C. 换一个不依赖 optional 解析的验证

用 `node -e "require('@zeus-js/compiler-native')"` 直接从解包目录验证，跳过 `npm install`。

**代价**：验证的保真度下降（不再是真实安装路径）。

## 6. 建议

**B**。它修的是 smoke 本身的一个真实缺陷：`--local-package` 声称要验证本地 tarball，
却让 npm 去 registry 解析同版本的 optional 依赖——这在首发场景下必然失败，
在非首发场景下又会误用 registry 上的旧版本。

这与本轮的 `mergeEvents` 修复是同一类问题：**一个门禁在特定输入下静默失去意义**。

## 7. 需要你决定

1. 是否要我按 **B** 改 `smoke-compiler-install.ts`（会改 CI 门禁的行为）
2. 或者你倾向 A / C
3. `v0.2.0-rc.3` tag 指向旧树这件事，是否需要单独开一个调查（涉及 tag 何时被改指）

在这三个回答之前，我不会创建任何 tag 或推送任何发布。
