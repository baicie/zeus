# `ZEUS_UI_COMMIT` 治理方案（T5）

日期：2026-11-15  
基线：Core `49e8446c`，UI `89fc93ca`  
状态：**方案，未修改生产变量**

---

## 1. 它现在是什么

```
ZEUS_UI_COMMIT = ffde55920fe9beab52dfe67bdca6d2e4023f28df
created_at: 2026-11-09T13:51:19Z
updated_at: 2026-11-09T13:51:19Z      ← 从未更新
```

三个工作流读它：

| 工作流                 | 用途                                      |
| ---------------------- | ----------------------------------------- |
| `admin-image.yml`      | 写进 `build-info.json` 的 `uiCommit`      |
| `playground-image.yml` | 同上                                      |
| `demos-pages.yml`      | **不读**——它 `git fetch` 取当时 main 尖端 |

## 2. 它现在**不是**什么

这是本轮最重要的澄清，因为它决定了修法：

**它不表示「镜像里的 UI 源码来自哪个提交」。**

| 产品       | 实际 UI 输入                                              | 与 `ffde5592` 的关系 |
| ---------- | --------------------------------------------------------- | -------------------- |
| Admin      | 24 个 npm 包 `0.1.0-beta.34` + vendored dialog `74662b61` | **无**               |
| Playground | **零**                                                    | **无**               |

Admin 的构建从不检出 `ffde5592`。Playground 也从不检出任何 UI commit。

**所以把它改成 `89fc93ca` 不会让记录变正确——只会用一个不真实的声明替换另一个。**

## 3. 正式语义应该是什么

只能有一个诚实的定义：

> **`ZEUS_UI_COMMIT` = 本次发布所声明的配对 UI 提交（declared pairing commit）。**

它是**意图**，不是**观察**。R7 的 `uiSources` 已经记录了观察那一半。

## 4. 三个选项

### A. 保持固定配对（现状）

优点：语义简单，发布时人工确认一次。
缺点：值会陈旧，且不随 UI 推进更新——现在就是这种情况。

### B. 改为独立的 `declaredPairingCommit`

把变量重命名，让它不再暗示「源码 commit」：

```
ZEUS_UI_DECLARED_PAIRING_COMMIT
```

并在 `build-info.json` 里写成 `declaredPairingCommit`（R7 的 `uiSources` 已用这个名字）。

**优点**：名字与含义一致，误读消失。
**代价**：需要同步改四个工作流与所有读 `uiCommit` 的消费者；`build-info.json` 的 `uiCommit`
字段若改名会破坏既有读取方。

**推荐做法**：保留 `build-info.uiCommit` 字段名（兼容），但让仓库变量改名，并在文档里
明确它的语义。改名成本低、兼容性零损失。

### C. Playground 标记 notApplicable

Playground 的 `uiCommit` 记录一个它从未读取的仓库。诚实做法是让它明确表达这一点。

R7 已经实现了：`uiSources.relationship.usesWebPackages: false`。

**但 `build-info.uiCommit` 本身仍是必填字段。** 三个选择：

| 做法                                     | 影响                                                  |
| ---------------------------------------- | ----------------------------------------------------- |
| 保持必填，值照写                         | 记录仍在，但 `relationship` 已说明它无意义            |
| 改为可选，Playground 省略                | 破坏 `verifyDeployedBuildInfo` 的必填校验与既有消费者 |
| 保持必填，但允许字面量 `'notApplicable'` | 破坏「必须是 40 位 SHA」的校验                        |

**本轮推荐第一个**：不动 schema，`relationship` 已经承担了「这不适用」的表达。
改变必填性是破坏性变更，需要单独的迁移计划。

## 5. 变量本身怎么处理

### 5.1 短期（不授权不改）

**不要把它改成 `89fc93ca`。** 理由见 §2。

若维护者希望它反映当前配对，应改为**配对记录里的值**，而不是 UI main 尖端：

```bash
# 从已发布的 demo-pairing.json 读取，而不是猜
curl -s https://baicie.github.io/zeus-demos/demo-pairing.json | jq -r .uiCommit
```

### 5.2 中期（需授权）

1. 变量改名为 `ZEUS_UI_DECLARED_PAIRING_COMMIT`；
2. 工作流读取新名，保留旧名 fallback 一个发布周期；
3. 文档与 RC 验收门禁同步。

### 5.3 是否需要同步更新 RC 验收

**需要。** 当前 `rc-manifest.ts` 的 blocker 把 `build-info names ui ffde5592` 归为
`environment`。这在语义正确之前是对的；改名后应改为检查
`uiSources.relationship` 与 `declaredPairingCommit` 是否自洽，而不是比较一个数字。

## 6. 本轮做了什么

**没有修改生产变量。** 只做了语义分析与三个选项的评估。

`ui-sources.ts`（R7 + R8 的 T2/T3）已经把「声明」与「观察」分开记录：

```json
{
  "declaredPairingCommit": "ffde5592…",
  "relationship": { "usesWebPackages": true, "checksOutUiRepository": false, … },
  "sources": [
    {
      "kind": "registry",
      "integrity": "sha512-…",
      "sourceCommit": "a8826dd1…",
      "sourceCommitProvenance": "attestation"
    }
  ]
}
```

> 注：`sourceCommit` 不再是 `UNVERIFIED`——SLSA attestation 给出了真实提交（R9 #284），
> 见 `2026-11-15-ui-provenance.md` §2.2。

**这才是修复「虚假 uiCommit」的正确位置**——不是改那个变量的值。
