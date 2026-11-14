# UI Source Provenance：真实来源关系

日期：2026-11-15  
基线：Core `96ceb447` + UI `89fc93ca`  
状态：**调查完成，schema 已实现，生产变量未改**

---

## 1. 核心结论

**`uiCommit` 从来没有表示「这个镜像的 UI 源码来自哪个提交」。** 它表示的是「发布配对的声明值」——
一个来自 GitHub Actions 变量的、与实际构建无关的字符串。

三个产品的情况完全不同：

| 产品             | 是否读 UI 仓 | 实际 UI 输入                       |
| ---------------- | ------------ | ---------------------------------- |
| **Admin**        | 是（间接）   | 24 个 npm 包 + 1 个 vendored 包    |
| **Playground**   | **否**       | 零                                 |
| **AI Workbench** | 是（直接）   | UI 仓源码，`uiCommit` 在那里是真的 |

## 2. Admin 的全部 UI 输入

来源：`examples/admin/package.json`

| 来源         | 数量                        | 版本格式                            |
| ------------ | --------------------------- | ----------------------------------- |
| npm registry | **24**                      | `0.1.0-beta.34`（精确）             |
| vendored     | **1**（`@zeus-web/dialog`） | `file:../../vendor/zeus-web-dialog` |

### 2.1 每一个输入的真实来源

| 输入                | 来源                         | 可证明的提交                                             |
| ------------------- | ---------------------------- | -------------------------------------------------------- |
| 24 个 `@zeus-web/*` | npm registry `0.1.0-beta.34` | **`UNVERIFIED`** — 见 §2.2                               |
| `@zeus-web/dialog`  | `vendor/zeus-web-dialog`     | **`74662b61`**（`provenance.json` 记录，且可逐文件校验） |

### 2.2 为什么 npm 包的提交是 UNVERIFIED

`0.1.0-beta.34` 发布于 2026-10-26T13:03:41Z，带 npm provenance attestation。
但**那个版本对应 UI 仓的哪个提交，本仓库无法证明**：

- `pnpm-lock.yaml` 记录的是 tarball integrity，不是 UI 提交；
- npm 的 provenance attestation 绑定的是发布时的 workflow，不是源码提交；
- 本仓库没有 UI 仓在 `0.1.0-beta.34` 发布时刻的 SHA 记录。

**我不猜。这条标 `UNVERIFIED`。**

要闭合它，需要在 UI 仓发布时写入一个 `sourceCommit` 字段到包的 metadata，或让 Admin 记录
`pnpm-lock.yaml` 里这些包的 integrity 值——后者本轮已能做但未做（见 §6）。

### 2.3 vendored dialog 的来源是完整的

```
package:       @zeus-web/dialog
version:       0.1.0-beta.35
commit:        74662b614e209e38a7b2b4557aa28df01141be25
contentDigest: sha256:30f23d06a9652ecbf48788ae225c0d1d52502dd98e51d4a87c85e1c984e04cec
files:         69（逐文件 sha256）
```

`pnpm check:vendored-dialog` 会重算 `contentDigest`、逐文件比对、并拒绝任何未登记文件。

## 3. Playground 的全部 UI 输入

`examples/playground-editor/package.json` 的依赖里 **`@zeus-web/*` 数量为 0**。

它的 9 个依赖全部是 `@zeus-js/*`，且全部是 `workspace:*`：

```
@zeus-js/compiler-wasm  @zeus-js/i18n  @zeus-js/playground-engine
@zeus-js/query  @zeus-js/router  @zeus-js/runtime-dom
@zeus-js/signal  @zeus-js/zeus  @zeus-js/vite-plugin
```

**因此 Playground 的 `build-info.uiCommit` 记录的是一个这个构建从未读取的仓库。**

这不是「记录不准」，是「记录无意义」。它现在是 `ffde5592`，改成任何值都一样无意义。

## 4. `uiCommit` 的实际语义

| 可能的含义         | 是否成立                                               |
| ------------------ | ------------------------------------------------------ |
| 整套 UI 的源码提交 | **否** — Admin 不检出 UI 源码                          |
| 指定 UI 版本       | **否** — 版本由 `package.json` 的 `0.1.0-beta.34` 决定 |
| 发布配对           | **部分** — 这是它唯一合理的含义                        |
| 期望的 UI 来源     | **部分** — 是「声明」，不是「观察」                    |

**结论**：`uiCommit` 是一个**声明值（declared pairing）**，不是**来源证明（source provenance）**。
把它当作后者读，就会得出「镜像来自 UI 提交 X」这个假结论。

## 5. 新 schema

### 5.1 设计原则

1. **不改 `uiCommit` 的含义** —— 所有既有消费者继续读到同一个值；
2. **新增 `uiSources`** —— 显式表达真实来源，与声明并列；
3. **可证伪** —— `verifyUiSources` 会重新读 manifest 与 provenance 比对。

### 5.2 结构

```json
{
  "schema": "zeus.ui-sources/v1",
  "declaredPairingCommit": "ffde5592…",
  "readsUiRepository": true,
  "sources": [
    {
      "kind": "registry",
      "package": "@zeus-web/button",
      "version": "0.1.0-beta.34"
    },
    {
      "kind": "vendored",
      "package": "@zeus-web/dialog",
      "version": "0.1.0-beta.35",
      "commit": "74662b61…",
      "contentDigest": "sha256:30f23d06…"
    }
  ]
}
```

Playground 的：

```json
{
  "schema": "zeus.ui-sources/v1",
  "declaredPairingCommit": "ffde5592…",
  "readsUiRepository": false,
  "sources": []
}
```

**`readsUiRepository: false` 是这套 schema 最重要的一位**：它让读者一眼看出
「这里的 `declaredPairingCommit` 不描述任何东西」。

### 5.3 兼容性

`uiSources` 是**可选字段**。旧的 `build-info.json` 没有它，`verifyDeployedBuildInfo` 不要求它。
迁移是**增量的**：下一次镜像构建就会带上，旧的保持不变。

## 6. 实际产物

用真实 dist 跑 `build-info.ts --ui-manifest`：

**Admin**：

```
uiCommit:              ffde55920fe9beab52dfe67bdca6d2e4023f28df
uiSources.schema:      zeus.ui-sources/v1
declaredPairingCommit: ffde55920fe9beab52dfe67bdca6d2e4023f28df
readsUiRepository:     true
source kinds:          {"registry":24,"vendored":1}
vendored:              {"package":"@zeus-web/dialog","version":"0.1.0-beta.35",
                        "commit":"74662b614e209e38a7b2b4557aa28df01141be25",
                        "contentDigest":"sha256:30f23d06…"}
```

**Playground**：

```
uiCommit:          ffde55920fe9beab52dfe67bdca6d2e4023f28df
readsUiRepository: false
sources:           []
```

**声明与观察第一次被分开记录。**

## 7. 测试

`scripts/release/__tests__/ui-provenance.spec.ts`，**20 项**：

| 组                       | 覆盖                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------- |
| Admin 输入事实（4）      | 精确钉版、只有一个 vendored、路径正确、其余来自 registry                                            |
| Playground 事实（2）     | 零 `@zeus-web` 依赖、全 workspace Core                                                              |
| vendored provenance（2） | 40 位 SHA、包名与版本                                                                               |
| `collectUiSources`（4）  | Admin 混合来源、Playground 空、缺 provenance 报错、确定性                                           |
| `verifyUiSources`（8）   | 正常通过、配对不符、vendored commit 篡改、digest 篡改、版本漂移、缺包、多包、谎报 readsUiRepository |

## 8. 未做

| 项                                    | 原因                                                  |
| ------------------------------------- | ----------------------------------------------------- |
| 改 `ZEUS_UI_COMMIT`                   | **任务明确禁止**                                      |
| 让 npm 包的 `sourceCommit` 可证明     | 需要 UI 仓在发布时写入，跨仓库变更                    |
| 记录 24 个 npm 包的 tarball integrity | 需要读 `pnpm-lock.yaml` 并接进 schema，可做但本轮未做 |
| 实际构建镜像验证                      | 需 Docker，且合并会自动部署                           |

## 9. 修复建议（需授权）

| 优先级 | 动作                                                           | 说明                                              |
| ------ | -------------------------------------------------------------- | ------------------------------------------------- |
| P0     | 更新 `ZEUS_UI_COMMIT` 到当前配对值                             | 不是改成 UI main 最新，而是改成**配对记录里的值** |
| P1     | UI 仓在发布时写入 `sourceCommit`                               | 让 24 个 npm 包的来源可证                         |
| P2     | Admin 记录各 npm 包的 tarball integrity                        | 从 `pnpm-lock.yaml` 读，接进 `uiSources`          |
| P2     | Playground 的 build-info 省略 `uiCommit`，或标 `notApplicable` | 现在它记录的是一个无意义的仓库                    |

**注意**：第 4 条需要改 `build-info.ts` 的必填校验，会影响既有消费者。本轮未做，留作决策。
