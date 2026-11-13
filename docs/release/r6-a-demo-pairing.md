# R6-A：Demo 构建来源与发布一致性

状态：**Draft PR，未合并、未推送、未部署。** 本文记录缺陷、修复、以及发布前后的元数据对照。发布动作由合并后的 `Demos Pages` 工作流执行，本文不触发它。

## 1. 缺陷（P0）

`baicie/zeus/.github/workflows/demos-pages.yml` 把两个仓库的产物当作一个来源发布：

| #   | 问题                                                                     | 位置（修复前）                                         |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------ |
| A-1 | UI 从默认分支浅克隆，没有固定 SHA                                        | `git clone --depth 1 …/zeus-ui.git zeus-ui`            |
| A-2 | 调用 `ai-demo-recording.ts` 时把 Core 的 `GITHUB_SHA` 传给 `--ui-commit` | `--ui-commit "${GITHUB_SHA}"`                          |
| A-3 | Admin 快照只记录 Core SHA，不记录配对                                    | `admin-demo-snapshot.ts` 的 `Snapshot` 没有 `uiCommit` |
| A-4 | 两个录制脚本对缺失参数静默写 `"unknown"`                                 | `default: 'unknown'`                                   |
| A-5 | 发布前没有任何校验，产物 digest 未记录                                   | 无此步骤                                               |
| A-6 | 测试与发布耦合：`workflow_dispatch` 也会走 publish job                   | `publish` 只 `needs: build`                            |

### 线上证据

2026-11-13 抓取已发布站点：

```text
GET https://baicie.github.io/zeus-demos/ai/ai-demo-recording.json
  schema      zeus.ai-demo/v1
  generatedAt 2026-11-13T06:00:54.569Z
  uiCommit    d7c82cfdd71efba1e3b84505e0414c3d1e1e94e3   ← Core main
```

而同一时刻 `zeus-ui` 的 `main` 是 `95302782b5f83268d8303fc7b14a99d6e6aac567`（commit `fix(ai-workbench): one composer per mode and a real chat surface (#144)`）。

`d7c82cfd…` 是 Core 的提交——正是这次运行 `demos-pages.yml` 的 `GITHUB_SHA`。**已发布的 Demo 声称自己由一次并未构建它的 UI 提交产生。** 这使 A-1 与 A-2 复合：分支在解析与构建之间可以移动，而记录下来的又不是解析出来的提交。

同一站点上 `demo-pairing.json` 返回 **404**：没有任何记录能说明这两个产物来自哪一对提交。

## 2. 修复

### 2.1 新增 `scripts/release/demo-pairing.ts`

配对清单成为一等的构建产物，schema `zeus.demo-pairing/v1`：

```json
{
  "schema": "zeus.demo-pairing/v1",
  "createdAt": "<ISO 时间戳>",
  "coreCommit": "<40 位小写 hex>",
  "uiCommit": "<40 位小写 hex>",
  "coreVersion": "<Core package.json 版本>",
  "uiVersion": "<zeus-ui package.json 版本>",
  "build": { "workflow": "Demos Pages", "runId": "…", "runUrl": "…" },
  "products": [
    {
      "product": "admin",
      "artifactDigest": "sha256:…",
      "files": 12,
      "bytes": 345678,
      "metadata": { "file": "demo-snapshot.json", "digest": "sha256:…" }
    },
    { "product": "ai", "artifactDigest": "sha256:…", "files": …, "bytes": …,
      "metadata": { "file": "ai-demo-recording.json", "digest": "sha256:…" } }
  ],
  "siteDigest": "sha256:…"
}
```

设计约束：

- **digest 算法与 `build-info.ts` 完全一致**（对 `path\0sha256\n` 逐文件哈希）。没有第二套哈希规则，因此 CI 里已有的 provenance 校验与 Demo 校验可以互相印证。
- **`siteDigest` 覆盖落地页与 `404.html`**，而这两个文件不属于任何产品目录；只改它们也必须被检出。
- `demo-pairing.json` 自身排除在 digest 之外，否则值会依赖自身。
- `createdAt` 是**入参**而非 `new Date()` 直读。这让"相同 SHA 组合可重复生成"可以被证明，而不是被时间戳掩盖。

`verifyDemoPairing` 拒绝的情况（全部返回错误列表，一次报全）：

| 拒绝条件                        | 触发方式                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------ |
| 非 `zeus.demo-pairing/v1`       | schema 不符                                                                    |
| SHA 不是 40 位小写 hex          | 短 SHA、大写、`main`、`unknown`、缺失                                          |
| SHA 与预期配对不一致            | 传入 `--core-commit` / `--ui-commit` 比对                                      |
| 版本缺失或不一致                | `coreVersion` / `uiVersion`                                                    |
| 缺字段                          | `createdAt`、`products`、`siteDigest`、`build`                                 |
| 产品记录缺失                    | `products` 里没有 `admin` 或 `ai`                                              |
| digest 格式非法                 | 非 `sha256:<64 hex>`                                                           |
| **产物字节与清单不符**          | 重新计算 `artifactDigest`、文件数、字节数                                      |
| **元数据文件与清单不符**        | 重算 metadata digest                                                           |
| **元数据声称的 SHA 与清单不符** | `demo-snapshot.json` / `ai-demo-recording.json` 里的 `coreCommit` / `uiCommit` |
| **整站 digest 不符**            | 重算 `siteDigest`                                                              |
| **不可复现**                    | `verifyDemoPairingReproducible` 重新生成清单并逐字段比对                       |

`verifyDemoPairingReproducible` 回答两个独立问题：同一输入调用两次是否一致（确定性），以及用清单里记录的 SHA、版本、时间戳与 workflow 重新生成能否**逐字段复现**已发布的那份（忠实性）。两者都失败时错误取**并集**——这一点有专门的回归测试，因为最初实现里 `--reproducible` 会替换掉基础错误列表，导致"来自错误提交但自身可复现"的清单被判 PASS。

### 2.2 `demos-pages.yml`

| 修复 | 做法                                                                                                                        |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| A-1  | `git init` + `git fetch --depth 1 origin <ref>` + `git checkout --detach FETCH_HEAD`，随后 `rev-parse HEAD` 记录真实 SHA    |
| A-2  | `--ui-commit "${{ steps.pair.outputs.ui }}"`、`--core-commit "${{ steps.pair.outputs.core }}"`                              |
| A-3  | Admin 快照新增 `uiCommit` 字段，与 Core 一起写入                                                                            |
| A-4  | 两个脚本的 `--core-commit` / `--ui-commit` 改为必填并校验 40 位小写 hex                                                     |
| A-5  | `Write the demo pairing manifest` → `Verify the demo pairing`（`--verify --reproducible`）→ 才 `Upload the site`            |
| A-6  | `publish` 增加 `if: github.event_name == 'push' \|\| inputs.publish == true`，`workflow_dispatch` 的 `publish` 默认 `false` |

额外加固：

- `Resolve and record the pair` 校验 `push` 事件下 `HEAD == GITHUB_SHA`，并把配对写入 job summary，人可以直接在运行页面看到。
- build job 内**没有任何 secret**（有契约测试断言 `buildJob` 不含 `secrets.` 与 `PAGES_TOKEN`），因此构建与测试阶段不可能推送 Pages、推镜像或重启服务。
- publish job 增加 `environment: demos-pages`，跨 job 传递后再校验一次 `coreCommit` / `uiCommit` / `siteDigest`，防止产物在传递中被替换。
- 推送 commit message 从 `demos: <Core SHA>` 改为 `demos: core <Core SHA> + ui <UI SHA>`。

### 2.3 两个录制脚本

| 文件                                             | 改动                                                                                                                       |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `zeus/scripts/release/admin-demo-snapshot.ts`    | `--core-commit`、`--ui-commit` 必填 + 格式校验；`Snapshot` 增加 `uiCommit`                                                 |
| `zeus-ui/scripts/release/ai-demo-recording.ts`   | `--ui-commit`、`--core-commit` 必填 + 格式校验；录制增加 `coreCommit`                                                      |
| `zeus-ui/examples/ai-workbench/src/demo-host.ts` | `AiDemoRecording` 增加 `coreCommit`；`isAiDemoRecording` 要求两个 commit 都是字符串，缺字段的录制被拒绝而不是显示"unknown" |

## 3. 测试

新增 4 个测试文件，共 **29 个用例**，全部本地通过。

```bash
# Core
pnpm exec vitest --project unit --run \
  scripts/release/__tests__/demo-pairing.spec.ts \
  scripts/release/__tests__/demos-pages-workflow.spec.ts \
  scripts/release/__tests__/admin-demo-provenance.spec.ts

# zeus-ui（本机 Node 22.12 需要 --experimental-sqlite）
NODE_OPTIONS=--experimental-sqlite pnpm exec vitest --project unit --run \
  scripts/checks/__tests__/ai-demo-provenance.spec.ts
```

| 文件                            | 用例数 | 覆盖                                                                                                                                                |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `demo-pairing.spec.ts`          | 16     | 清单生成、可复现、真实 SHA、错误 SHA、缺字段、字节篡改、落地页篡改、缺产品目录、schema 不符、`--reproducible` 不掩盖基础错误                        |
| `demos-pages-workflow.spec.ts`  | 7      | UI 以 SHA 检出而非分支、不使用 `GITHUB_SHA` 作为 UI commit、SHA 解析与 summary、校验早于上传、dispatch 默认不发布、跨 job 复验、build job 无 secret |
| `admin-demo-provenance.spec.ts` | 3      | 缺失/非法 SHA 被拒、快照记录两个 SHA、同一配对产生相同数据（审计时间戳归一化）                                                                      |
| `ai-demo-provenance.spec.ts`    | 3      | 缺失/非法 SHA 被拒、录制记录两个 SHA 与 diff 资产、同一配对产生相同事件序列与资产内容                                                               |

### CLI 端到端实测

在临时站点上跑真实 CLI（`--write` → `--verify --reproducible` → 篡改 → 再验）：

```text
=== write ===
demo pairing written: core aaaaaaaaaaaa + ui bbbbbbbbbbbb -> …/site/demo-pairing.json

=== verify (expect PASS) ===
demo pairing PASS (reproducible) for core aaaaaaaaaaaa + ui bbbbbbbbbbbb

=== wrong expected UI (expect FAIL) ===
MISMATCH demo pairing uiCommit bbbb… does not match cccc…
exit=1

=== metadata names Core as UI commit (the R6-A bug) ===
MISMATCH demo ai: metadata uiCommit aaaa… does not match pairing bbbb…
MISMATCH demo ai: metadata digest … does not match manifest …
MISMATCH demo ai: artifactDigest … does not match manifest …
MISMATCH demo pairing siteDigest … does not match manifest …
exit=1
```

最后一段就是 R6-A 的原始缺陷形态：把 Core SHA 写进 UI 元数据。修复后它在**三个层面**同时失败——元数据字段、元数据文件 digest、产品产物 digest（因为元数据是产物的一部分）。

## 4. 发布前后元数据对照

「发布前」为 2026-11-13 抓取的线上状态；「发布后」为本次改动合并、`Demos Pages` 在工作流中重新构建后的**预期**结构。本次未执行发布，发布后一栏需在合并后由实际抓取填充。

### 4.1 AI Workbench

| 字段          | 发布前（线上实测）                 | 发布后（预期）                                          |
| ------------- | ---------------------------------- | ------------------------------------------------------- |
| `schema`      | `zeus.ai-demo/v1`                  | `zeus.ai-demo/v1`                                       |
| `uiCommit`    | `d7c82cfd…` —— **Core 提交**       | 实际构建该 bundle 的 UI SHA                             |
| `coreCommit`  | **不存在**                         | 与 `demo-pairing.json.coreCommit` 相同                  |
| `generatedAt` | 有                                 | 有                                                      |
| 可核对性      | 无法核对：没有任何记录说明 UI 提交 | `demo-pairing.json` 同时给出两侧 SHA、版本、产物 digest |

### 4.2 Admin

| 字段         | 发布前（线上实测）                                | 发布后（预期）                         |
| ------------ | ------------------------------------------------- | -------------------------------------- |
| `schema`     | `zeus.admin-demo/v1`                              | `zeus.admin-demo/v1`                   |
| `coreCommit` | `d7c82cfd…`                                       | 与 `demo-pairing.json.coreCommit` 相同 |
| `uiCommit`   | **不存在**                                        | 与 `demo-pairing.json.uiCommit` 相同   |
| `users`      | 8                                                 | 由真实 seed 决定，不写死               |
| 可核对性     | 只能核对自己；无法说明它与 AI Demo 是否同一对提交 | 同一份清单绑定两个产品                 |

### 4.3 站点

| 资源                | 发布前                  | 发布后                                                             |
| ------------------- | ----------------------- | ------------------------------------------------------------------ |
| `demo-pairing.json` | **404**                 | 存在，含 `siteDigest`、每个产品的 `artifactDigest`、文件数、字节数 |
| Pages 提交信息      | `demos: <Core SHA>`     | `demos: core <Core SHA> + ui <UI SHA>`                             |
| build job summary   | 无                      | 「Demo pair」表：两侧 SHA 与版本                                   |
| artifact            | 只有 `demos-pages-site` | 另加 `demos-pages-pairing`（保留 30 天），供发布后核对             |

### 4.4 发布后核对命令

```bash
curl -s https://baicie.github.io/zeus-demos/demo-pairing.json | jq '{coreCommit,uiCommit,siteDigest}'
curl -s https://baicie.github.io/zeus-demos/ai/ai-demo-recording.json | jq '{uiCommit,coreCommit}'
curl -s https://baicie.github.io/zeus-demos/admin/demo-snapshot.json | jq '{coreCommit,uiCommit}'
```

三者必须两两一致；再用 `demo-pairing.json` 里的 digest 与 CI artifact `demos-pages-pairing` 对照。

## 5. 未执行 / 未验证

| 项                                         | 原因                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| 实际触发一次 `Demos Pages` 运行            | 需要 push 到 `main`，本次未获授权                                  |
| 发布后线上元数据抓取                       | 同上；本文 §4 的对照表由合并后补齐                                 |
| Windows 上运行这两个录制脚本               | 脚本无平台分支，但本机只有 macOS；CI 在 ubuntu 上跑                |
| `demos-pages.yml` 在 GitHub 上的语法接受度 | 本地用 YAML 解析器校验了结构与步骤顺序；最终以 GitHub 解析结果为准 |

## 6. 对 0.2.0 RC 的放行判断

**R6-A 在合并并成功运行一次工作流之前，不构成 RC 放行条件。** 当前状态是代码就绪、离线可证：

- 缺陷可复现（线上 `uiCommit` = Core SHA）；
- 修复后同一缺陷在元数据、文件 digest、产物 digest 三层都被拒绝；
- 相同 SHA 组合可重复生成有效 Demo（清单可复现 + 两个录制脚本的数据一致性测试）；
- 构建与测试阶段无法触达发布路径（契约测试保证 build job 无 secret，dispatch 默认不发布）。

仍缺一项：**合并后的一次真实运行**。它同时证明工作流在 GitHub runner 上成立、以及发布出的站点元数据与本文预期一致。在那之前，`0.2.0-r6-integration-audit.md` 中此项应记为「已修复，待一次真实发布验证」。
