# RC 发布链路只读审计（R20 / TASK J）

**只读。** 本轮未执行 `npm publish`、未修改 dist-tag、未创建或移动 Release Tag。

审计时间：2026-11-21
仓库 HEAD：`f07c0375`（main）
registry：`https://registry.npmjs.org`
证据：32 次 `npm view`（每包一次）、4 次 `gh release view`、本地 `git tag` / `git rev-list`。

---

## 1. 结论

| 项目                            | 状态                                      |
| ------------------------------- | ----------------------------------------- |
| 固定发布组                      | 32 包（`scripts/release.config.ts` 断言） |
| npm 上存在的包                  | **31 / 32**                               |
| 从未存在于 npm                  | **1** — `@zeus-js/i18n`                   |
| 已发布 `0.2.0-rc.3`             | **7 / 32**                                |
| 有 `rc` dist-tag 且指向 rc.3    | 7                                         |
| GitHub Release（`v0.2.0-rc.*`） | **0 / 4** — 四个 tag 均无 Release         |
| RC tag                          | 4 个均存在，`v0.2.0-rc.3` → `649e2f60`    |

---

## 2. 逐包状态

### 2.1 从未在 npm 存在（1）

| 包              | 源码版本     | 影响                 |
| --------------- | ------------ | -------------------- |
| `@zeus-js/i18n` | `0.2.0-rc.3` | 发布组契约要求它存在 |

`release-pairing/v0.2.0-rc.3.json` 明确把 i18n 列入 `firstPublish`：

```json
"bootstrap": true,
"firstPublish": [
  "@zeus-js/i18n",
  "@zeus-js/eslint-plugin",
  "@zeus-js/playground-engine"
]
```

**三者中两个发布了，i18n 没有。** 同一份配对记录里另外两个 `firstPublish` 包
（`eslint-plugin`、`playground-engine`）在 registry 上都有 `0.2.0-rc.3`，且各自的
`latest` 也因此被改写为 rc.3——这是首发的正常后果。

i18n 连一个版本、一个 dist-tag 都没有，`npm view` 返回 404。**它不是"发布失败"，
是"从未被 publish 触及"。**

这与 `docs/release/r18.3-rc3-gap-audit.md`（#335）的记录**不矛盾**：那份审计的
"缺失 25 包"里不含 i18n，因为它的统计口径是"发布组 32 − 已发布 7"，而
7 + 25 = 32 这个算术等式掩盖了 i18n 属于第三类。**本轮把三类分开**：

- 已发布 rc.3：7
- 存在但无 rc.3：24
- 从未存在：1

### 2.2 已发布 `0.2.0-rc.3`（7）

| 包                                         | 备注                        |
| ------------------------------------------ | --------------------------- |
| `@zeus-js/compiler`                        |                             |
| `@zeus-js/compiler-native`                 | napi 宿主                   |
| `@zeus-js/compiler-native-darwin-arm64`    |                             |
| `@zeus-js/compiler-native-darwin-x64`      |                             |
| `@zeus-js/compiler-native-linux-arm64-gnu` | 第 7 个，也是最后一个成功的 |
| `@zeus-js/eslint-plugin`                   | 首发，`latest` = rc.3       |
| `@zeus-js/playground-engine`               | 首发，`latest` = rc.3       |

### 2.3 存在但无 rc.3（24）

其中 4 个 Native 平台包停在 canary：

```
compiler-native-linux-x64-gnu    latest 0.1.1-canary.20260812.106.1.658fe407
compiler-native-linux-x64-musl   latest 0.1.1-canary.20260812.106.1.658fe407
compiler-native-win32-arm64-msvc latest 0.1.1-canary.20260812.106.1.658fe407
compiler-native-win32-x64-msvc   latest 0.1.1-canary.20260812.106.1.658fe407
```

**这 4 个包的 `latest` 指向 canary。** 一个 `npm i @zeus-js/compiler-native-linux-x64-gnu`
的消费者会拿到 canary 版本，而不是任何 RC 或稳定版。

其余 20 个（`shared`、`signal`、`runtime-dom`、`zeus`、`router`、`resource`、
`query`、`testing`、`bundler-plugin`、`component-*`、`web-c*`、`output-*`、
`compiler-shared`）的 `latest` 在 `0.1.0` 或 canary。

---

## 3. GitHub Release 状态

四个 tag 全部存在，**没有一个有对应 Release**：

```
$ gh release view v0.2.0-rc.0  → release not found
$ gh release view v0.2.0-rc.1  → release not found
$ gh release view v0.2.0-rc.2  → release not found
$ gh release view v0.2.0-rc.3  → release not found
```

最近一个 Release 是 `v0.1.1-beta.20`（2026-10-26）。**RC 阶段从未在 GitHub 上留下
Release 记录**，只有 tag。

`v0.2.0-rc.3` tag 指向 `649e2f6017c05129bb16345bd74c31135c99ad0e`，与审计基线一致，
未被移动。

---

## 4. TLOG 409：本轮没有新证据

`docs/release/r18.3-rc3-gap-audit.md` §4 已记录失败点：

```
第 8 个包 @zeus-js/compiler-native-linux-x64-gnu
npm error code TLOG_CREATE_ENTRY_ERROR
npm error error creating tlog entry - (409) an equivalent entry already
  exists in the transparency log with UUID 108e9186e8c5677ad6...
```

那份审计的结论是：**成因不能确认**，因为"同一 tarball 此前已签名但未落库"与
"Sigstore 重试语义"两种解释没有 registry 侧证据可区分。

**本轮没有推翻也没有补充这个结论。** 我能加的只有一条时间性事实：

- 失败发生在 rc.3（2026-11-18 之后）。
- 截至本轮（2026-11-21），`compiler-native-linux-x64-gnu` 的 `latest` 仍是
  2026-08-12 的 canary，**说明此后没有任何一次重试成功过这个包**。

这排除了"偶发 409 自行恢复"的可能，但仍不能确定根因。**不写结论。**

---

## 5. 恢复路径

### 5.1 幂等性是确定的

`publishOnePackage` 默认 `skipExisting: true`，重跑同一 tag 会跳过已发布的 7 个包。
这一点 #335 已核实，本轮不重复验证。

### 5.2 两个前置条件仍然成立

1. **TLOG 409 未解决。** 若根因是条目已存在，重试会在同一包上持续失败。
2. **tarball 一致性。** 重发的 tarball 必须与已签名条目一致。

### 5.3 i18n 是独立问题

即使 409 解决，`i18n` 也**不会**因为"跳过已存在"而自动补发——它不存在，所以会被
当作新包发布。这反而是好事（`skipExisting` 不会跳过它），但意味着：

- 它会在**没有前者经验**的情况下首次发布；
- 首次发布会把 `latest` 写成 rc.3（`eslint-plugin` 与 `playground-engine` 已验证
  这个行为）；
- **i18n 的首次发布从未被任何一次 Run 测试过。**

### 5.4 不允许的方式（沿用 #335）

- 发布 rc.4 来"覆盖" rc.3
- 删除已发布的 7 个包
- 手工 `npm publish` 单包（绕过 provenance 与发布顺序）

---

## 6. `skipExisting` 的恢复语义

`skipExisting: true` 的语义是"如果 registry 上已存在该 `name@version`，跳过"。
它**不**检查内容是否一致、**不**检查 provenance、**不**检查 tag。

因此：

| 情形                                                    | `skipExisting` 的行为 |
| ------------------------------------------------------- | --------------------- |
| 包已发布且版本相同                                      | 跳过                  |
| 包已发布但版本不同                                      | 发布新版本            |
| 包从未发布                                              | 发布                  |
| 包已发布但 tarball 不同（不可发生，npm 拒绝同版本重发） | —                     |

**它保证重跑不会失败，不保证重跑会补全。** 一个"看起来成功"的重跑可能是 25 个包
被跳过、0 个被发布。恢复 Run 的报告必须核对实际发布数，而不是只看退出码。

---

## 7. 与 `RC_RELEASE_READY` 的关系

**不成立。** 三项独立阻断：

1. **`0.2.0-rc.3` 只发布了 7/32。**
2. **`@zeus-js/i18n` 从未存在**，且它的首发路径从未被执行过。
3. **四个 RC tag 都没有 GitHub Release。**

第 3 项与前两项独立：即使 npm 侧修复，Release 仍不存在。

---

## 8. 本轮未做

| 项                   | 原因                             |
| -------------------- | -------------------------------- |
| 重跑 Release Run     | 任务禁止（只读审计）             |
| 查询 Sigstore 侧日志 | 需要 npm/Sigstore 凭证，仓库没有 |
| 验证 tarball 一致性  | 需要已签名条目的内容，不可得     |
| 修复 i18n 首发       | 属发布操作，不是审计             |

---

## 9. 下一步（需要授权的操作，本轮不做）

1. **查明 i18n 为何从未被 publish 触及。** 这是可查的：Release Run 的日志会显示
   它是否进入过队列。当前证据只说明结果，不说明原因。
2. **解决 TLOG 409**（npm/Sigstore 侧）。
3. **重跑 rc.3 并核对实际发布数**，不要只看退出码。
4. **补齐 4 个 RC tag 的 GitHub Release**，或明确记录"RC 阶段不建 Release"是有意决策。
