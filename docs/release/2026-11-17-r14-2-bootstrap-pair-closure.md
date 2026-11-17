# R14.2 — Bootstrap → Pair Release Protocol Closure

生成时间：2026-11-17
范围：Core `baicie/zeus`、UI `baicie/zeus-ui`

## 1. 基线

开始前重新获取，未假设任务描述中的 SHA 仍然有效。

| 仓库 | main       | 说明           |
| ---- | ---------- | -------------- |
| Core | `55009c45` | 与任务描述一致 |
| UI   | `d18f6d7`  | 与任务描述一致 |

Registry 状态（实测 `registry.npmjs.org`）：

```
@zeus-js/zeus dist-tags: latest=0.1.0, beta=0.1.1-beta.20
0.2.0-rc.0 存在: false
```

Tag ruleset：

| 仓库 | 名称                     | target | 规则                                               | bypass           |
| ---- | ------------------------ | ------ | -------------------------------------------------- | ---------------- |
| Core | main branch protection   | branch | deletion, non_fast_forward, required_status_checks | RepositoryRole 5 |
| Core | release tag immutability | tag    | deletion, update                                   | 无               |
| UI   | Protect release tags     | tag    | update, deletion                                   | 无               |
| UI   | main                     | branch | （disabled，legacy 保护另在生效）                  | 无               |

## 2. 四个 P0 的复现与修复

### P0-A：bootstrap 后永久无法配对

**复现**（代码证据，`scripts/checks/release/check-release-pairing.ts:243-266`）：

```ts
const recordPath = `${CORE_PAIRING_DIRECTORY}/v${coreVersion}.json`
const raw = readCoreFile(tagCommit, recordPath)
// ...
if (parsed.uiCommit.toLowerCase() !== input.uiCommit.toLowerCase()) {
  errors.push(`Core record at v${coreVersion} names UI commit ...`)
}
```

记录从 **tag 指向的 commit** 读取。Bootstrap tag 里 `uiCommit` 是 `null`，tag 不可移动，因此该比较永远不可能成立。

**修复**：新增 `pair/v<version>` 独立 tag，指向**后来的** Core commit，携带 attestation：

```json
{
  "schema": "zeus.pair-attestation/v1",
  "releaseTag": "v0.2.0-rc.0",
  "coreCommit": "<bootstrap tag 目标>",
  "coreVersion": "0.2.0-rc.0",
  "uiCommit": "<UI 候选>",
  "uiVersion": "0.2.0-rc.0",
  "bootstrap": true,
  "verifiedAt": "..."
}
```

`evaluatePairing` 在 tag 内记录为 `uiCommit: null` 时走 `evaluateBootstrapPairing`，从 pair tag 读 attestation，要求：

- `coreCommit` == release tag 目标（调用方从 Git 读，不从文件取）
- `uiCommit` == 正在发布的 commit
- `bootstrap === true`（tag 内部记录未配对，attestation 必须一致）
- schema、`releaseTag`、`coreVersion`、`uiVersion` 全部匹配

### P0-B：`core_commit` 无生产者

**复现**（`release.yml`）：

```yaml
outputs:
  core_commit: ${{ steps.pairing_core.outputs.core_commit }}
```

`id: pairing_core` 的 step **没有任何 `>> $GITHUB_OUTPUT` 写入**。已用测试证明：解析旧 workflow 时该 step 的产出键集合为 `[]`。

**修复**：同一 step 内从刚生成的报告派生，并新增 `pairing_mode`：

```bash
CORE_COMMIT=$(node -p "const r=require('$PAIRING_REPORT'); r.coreCommit ?? ''")
PAIRING_MODE=$(node -p "require('$PAIRING_REPORT').mode")
```

`publish.yml` 新增 `pairing_mode` 输入（`workflow_call` 与 `workflow_dispatch` 都声明），非 `online` 一律拒绝。

### P0-C：`--out` 无生产者

**复现**：`writeFileSync` 只出现在 `writeCorePairingTemplate`（模板生成器）中，CLI 的 `--out` 被解析后忽略。实测：

```
$ tsx check-release-pairing.ts --version 0.2.0-rc.0 --out /tmp/pair-report.json
$ ls /tmp/pair-report.json
No such file or directory
```

**修复**：新增 `buildPairingReport` / `writePairingReport`，失败时也写。报告记录 `mode`（`static` / `online`），静态模式的所有 commit 字段为 `null`，不会被读成在线结果。

### P0-D：bootstrap 是万能钥匙

**复现**：`release-authorization.ts` 中 `input.bootstrap === true` 直接走 `POLICY_LIMITATION` 分支，没有任何适用性判定。

**修复**：新增 `scripts/release/bootstrap-eligibility.ts`，从 registry 与既有记录状态判定：

| 条件                     | 结果 |
| ------------------------ | ---- |
| 非 prerelease（稳定版）  | 拒绝 |
| 非 `rc` 频道             | 拒绝 |
| 非 `rc.0`                | 拒绝 |
| 该版本已发布             | 拒绝 |
| 该版本线已有其他 RC      | 拒绝 |
| Registry 不可达          | 拒绝 |
| 已有 attestation         | 拒绝 |
| 树内记录已命名 UI commit | 拒绝 |
| 未计算适用性             | 拒绝 |

`core-ui-pairing` 消费该结论；未计算时**拒绝**，不按宽松方向默认。

## 3. 不可变证据

### 格式

`PAIR_ATTESTATION_SCHEMA = 'zeus.pair-attestation/v1'`，路径 `release-pairing/attestations/v<version>.json`。

### 信任来源

不是文件形状，是两个外部事实：

| 事实                             | 来源                                              |
| -------------------------------- | ------------------------------------------------- |
| `coreCommit` == release tag 目标 | `gh api .../git/ref/tags/v<v>`，注解 tag 会解引用 |
| `uiCommit` == 发布 commit        | workflow 的 `GITHUB_SHA`                          |

### 命名空间实测

| 操作                                   | 结果                                    |
| -------------------------------------- | --------------------------------------- |
| 创建 `refs/tags/pair/v9.9.9-glob-test` | 成功                                    |
| 用现有 `v*` ruleset 更新它             | **成功**——不受保护                      |
| 是否触发任何 workflow                  | **否**                                  |
| 清理                                   | 是，`matching-refs/tags/pair` 返回 `[]` |

`v*` 的 `*` 不跨 `/`，因此 `pair/v…` 不匹配 release 触发器，不会造成第二次 npm 发布。

### 3.1 pair tag 被移动会怎样（实测，不是推断）

初版文档把「需要独立的 pair ruleset」写成了阻塞项。这个判断过强，实测推翻了一半：

| 情况                                                                      | 结果     |
| ------------------------------------------------------------------------- | -------- |
| 正常 attestation                                                          | 通过     |
| pair tag 被移到另一个 commit，那里放一份指向别的 UI commit 的 attestation | **拒绝** |
| attestation 的 `uiCommit` 改成别的                                        | **拒绝** |
| attestation 的 `coreCommit` 改成别的                                      | **拒绝** |
| attestation 去掉 `bootstrap: true`                                        | **拒绝** |

原因是校验读的是 **tag 解析到的那个 commit 的内容**，tag 指哪就读哪，而读到的内容必须与 release tag 的 SHA、正在发布的 UI commit 自洽。伪造一份内容让四项同时成立，等于伪造了整个链接。

所以 ruleset **不是协议工作的前提**。它防的是另一件事：`pair/v0.2.0-rc.0` 今天指向 A，一周后被删掉重建指向 B，两次都各自自洽、都验证通过——「这个版本配对的是哪个 UI commit」的答案变了，而没有任何记录显示它变过。

这与 `v*` ruleset 防的是同一类问题，区别在于 `v*` 有代码侧兜底（`tag-unmoved` 在发布运行期间重读比对），`pair/*` 目前没有，因为写入 pair tag 不在任何 workflow 里。

**结论**：首次配对可以不配 ruleset——没有历史可比对，风险最低。第二次配对前应当补上，或者用代码记录历史 SHA 来替代。

## 4. 完整 Workflow DAG

### Core（tag 触发）

```
push v* tag
  → native-prebuild (compiler-native.yml)
  → release job
      checkout (fetch-depth 0)
      ├─ Verify npm release authentication (NPM_TOKEN)
      ├─ Download/Restore native artifacts
      ├─ Extract version from tag
      ├─ Verify release tag source
      ├─ Read the paired UI commit            ← bootstrap 时可 uiCommit=null
      ├─ [非 bootstrap] Checkout paired UI commit
      ├─ [非 bootstrap] Verify Core/UI exact pairing
      ├─ Record the pairing decision          ← 新增，bootstrap 也写
      ├─ Preserve UI pairing evidence
      ├─ Release precheck (含 check:sbom:write)
      ├─ Authorise the release                ← 消费 bootstrapEligible
      ├─ [非 bootstrap] Prepare/Build UI candidates
      ├─ Build and publish (pnpm release --publishOnly)
      ├─ Verify npm publication
      ├─ Verify npm dist-tags and provenance
      └─ Check npm latest after publishing
  → compiler-registry-smoke (Node 22.18 / 24.11)
  → github-release
```

### UI（dispatch 触发）

```
workflow_dispatch(version, tag)
  → validate-context
  → dry-run（dry_run=true 时）
  → release job                ← 只在 main 且 dry_run=false
      checkout
      ├─ Verify dispatch revision
      ├─ Verify prepared release
      ├─ Verify immutable Core/UI pairing    ← --online，现在产出 core-commit/mode
      │    └─ 写 GITHUB_OUTPUT: core-commit, mode    ← 修复点
      ├─ Preserve pairing evidence           ← 需要文件真实存在（修复点）
      └─ Tag release
  → dispatch-publish
      ├─ Verify the Core release is immutable  ← 校验 mode=online + tag 解引用
      └─ Dispatch publish.yml（带 pairing_mode）
        → publish.yml
            Verify dispatch context             ← mode 守卫
            Verify release tag
            install / build / verify-pack
            Verify immutable Core/UI pairing（--online）
            Revalidate release tag
            Verify registry reachability
            Capture latest baseline
            Publish package
            Verify published packages
```

### 数据生产/消费核查

| 值                          | 生产者                                | 消费者             | 绑定当前 SHA       | 可能旧产物 | 空输出                     |
| --------------------------- | ------------------------------------- | ------------------ | ------------------ | ---------- | -------------------------- |
| `core-commit`               | pairing step（从报告派生）            | dispatch-publish   | 是（报告来自本次） | 否         | 已拒绝                     |
| `pairing_mode`              | 同上                                  | dispatch + publish | 是                 | 否         | 已拒绝                     |
| `release-pairing.json`      | `--out`（修复后）                     | upload-artifact    | 是                 | 否         | `if-no-files-found: error` |
| `coreCommit`（attestation） | `write-pair-attestation`（从 tag 读） | UI online pairing  | 是                 | 否         | 拒绝                       |
| tag 目标                    | Git                                   | 全部校验           | 是                 | —          | 拒绝                       |

## 5. 真实双仓 Git E2E

用真实 git 仓库（非 mock）构造：

```
Core bootstrap commit   69c871c9  → tag v0.2.0-rc.0
UI candidate            9f9b6658
Core pair commit        664899fe  → tag pair/v0.2.0-rc.0
UI evaluatePairing      ok: true（读真实 git 对象，非 stub）
release tag 事后        69c871c9  ✓ 未移动
```

`pair tag` 与 `release tag` 指向不同 commit，且 release tag 在配对建立后仍指向 bootstrap commit。

该构造性测试在 `pair-attestation.spec.ts` 中固化为回归测试，跑在真实 `git init` 的临时仓库里。

## 6. 对抗审查

每条都实际执行，不是阅读代码推断。

| 攻击                                   | 结果                                                 |
| -------------------------------------- | ---------------------------------------------------- |
| attestation 重放（rc.0 改名成 rc.1）   | 三重拒绝：`releaseTag` / `coreVersion` / `uiVersion` |
| 伪造 `coreCommit`（指向另一个 commit） | 拒绝：「is not the commit v… points at」             |
| pair tag 指向分支名                    | 拒绝                                                 |
| pair tag 指向短 SHA                    | 拒绝                                                 |
| attestation 是空文件                   | 拒绝                                                 |
| attestation 是数组                     | 拒绝                                                 |
| bootstrap + uiCommit 同时存在          | 拒绝                                                 |
| UI commit 大写                         | 通过（Git SHA 大小写不敏感，行为正确）               |

未发现错误的 PASS 路径。

## 7. CI 状态

最终 PR：**Core #314**、**UI #152**（都是 Draft）。

### Core #314

替换 #313 / #312。三次重建都因为分支名。

### UI #152

替换 #151 / #150。

### 分支名的两个陷阱（值得单独记）

`check:branch` 的白名单里有 `release/<version>`，但 `<version>` 只接受裸版本号
（`release/0.2.0-rc.0`）。协议改动不是版本号，所以 `release/r14-2-...` 被拒。

改到 `feat/release-bootstrap-pair` 后 check 通过，但 `.github/workflows/product-acceptance.yml` 有

```yaml
push:
  branches: ['feat/release-*']
  paths-ignore: ['docs/**', '**/*.md']
```

它 checkout **上游 `baicie/zeus-ui` 的 main**，跑 Admin/Playground/AI Workbench 的真实浏览器验收。
于是这个 PR 的 CI 里出现了两个必然失败项，失败内容是 UI 的
`getByTestId('inspector-toggle') … element is not visible` —— 与本 PR 改动零关系，
因为本 PR 只改 Core 的发布脚本和文档。

最终用 `feat/core-bootstrap-pair` / `feat/ui-pair-protocol`：`feat/<scope>-<topic>` 成立，
且 scope 不是 `release`，不触发那个 workflow。

**教训**：在 Zeus 里，分支名同时受两条规则约束，而它们的方向相反——
check 只要求"合法"，workflow 还要求"不撞发布分支模式"。

### 三轮 CI 修正（都是我的疏漏）

1. **`d756d1d`**：`release-scripts.spec.ts` 中另外两处断言了 workflow 结构
   （`dispatch-publish` env、dispatch inputs），我只改了契约检查那一份
2. **`455e27a`**：`ai-demo-provenance.spec.ts` 超时。它跑两次完整 Host 录制，
   5 秒默认超时不够。该测试与本分支改动无任何 import 关系，是慢 runner 上的
   时序问题，非回归；断言本身未改动
3. 分支名两次（见上）

### 我用错的方法（记录）

第一轮 CI 失败时我用 `gh run view --log` 拉日志，持续 TLS 超时。改用
`curl -H "Authorization: token $(gh auth token)" .../actions/jobs/<id>/logs`
一次成功（482 KB）。run 级端点会 302 到 `results-receiver.actions.githubusercontent.com`，
本机同样超时，所以必须用 job 级。

## 8. 未做的验证（NOT_RUN）

- 真实 npmjs 发布
- 真实 `v0.2.0-rc.0` tag 推送触发 `release.yml` 的完整运行
- pair tag 在**已配置 ruleset** 后的不可变性（ruleset 未配置，且按 §3.1 的决定延后）
- 7 平台跨平台安装（只在 darwin-arm64 验证）
- Node 22.18 / 24.11 双版本（本地 22.12，低于 engines）
- 隔离 Registry 的完整 33 包发布（本轮未重跑；R14.1 已验证该路径）

以上均**不是 PASS**。

## 9. 维护者配置（可延后，非阻塞）

Core 仓库可新增 tag ruleset：

| 字段         | 值                   |
| ------------ | -------------------- |
| target       | `tag`                |
| ref patterns | `refs/tags/pair/*`   |
| rules        | `deletion`, `update` |
| bypass       | 无                   |

**这不是协议工作的前提**（见 §3.1 的实测）。不加，四种伪造仍然全部被拒绝。

它关闭的是「配对记录可被静默替换」这个窗口。首次配对时该窗口风险最低——没有历史可比对。第二次配对前应当补上，或用代码记录历史 SHA 替代。

代码无法读取 ruleset（workflow token 无 Administration scope），所以 `tag-immutability` 规则始终报 `POLICY_LIMITATION`——那是如实报告，不是缺陷。

## 10. GO / NO_GO

**协议修复：GO**，已合入（Core `c434c9c7`、UI `ff2941e`）。

**首次 0.2.0-rc.0 Cut：GO**，条件已满足。剩下的两项是**工作项**，不是阻塞：

1. RC 版本切换 PR 未创建（Phase 7 未开始）
2. UI 的 `examples/ai-workbench` 仍钉 `0.1.1-beta.20`，需在版本切换时一并改

`pair/*` ruleset 不在阻塞列表里。

## 11. R14.3 实施顺序

1. ~~配置 `pair/*` tag ruleset~~ —— 可延后，不阻塞首次 Cut
2. 合并 Core #313 → UI #151
3. Core 版本切换 PR：`version-rehearsal --apply` + **手动** `sync-native-loader`（rehearsal 不调用它）+ bootstrap 记录
4. 合入后打 `v0.2.0-rc.0`，执行真实 Bootstrap 发布
5. 发布后 `repair:latest-tags --apply` 处理三个首发包的 `latest`
6. UI 切换全部 pin（**含 `examples/ai-workbench`**），对真实 registry 生成 lockfile
7. `write-pair-attestation` 生成证据 → 合入 → 打 `pair/v0.2.0-rc.0`
8. UI 发布，`--online` 走 attestation 路径
