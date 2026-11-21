# R21 发布链路取证

只读。未执行 `npm publish`、未修改 dist-tag、未创建或移动 Release Tag。

审计时间：2026-11-22
基线：`2798aee6`（main）
registry：`https://registry.npmjs.org`（实时查询，非历史结果）

---

## 1. 结论

| 项目                | 状态                       | 证据                   |
| ------------------- | -------------------------- | ---------------------- |
| 32 包实时审计       | **DONE**                   | 32 × `npm view`，见 §2 |
| npm 上存在          | 31 / 32                    |                        |
| 从未发布            | **1** — `@zeus-js/i18n`    |                        |
| 已发布 `0.2.0-rc.3` | 7 / 32                     |                        |
| i18n 未发布根因     | **ROOT_CAUSE_CONFIRMED**   | 见 §4                  |
| TLOG 409 根因       | **ROOT_CAUSE_UNCONFIRMED** | 见 §5                  |
| GitHub Release      | 0 / 4 个 RC tag            | 见 §6                  |

---

## 2. 实时审计（TASK 33）

32 个包逐个查询 `dist-tags.rc`、`dist-tags.latest`、`version`。

### 已发布 `0.2.0-rc.3`（7）

```
@zeus-js/eslint-plugin
@zeus-js/playground-engine
@zeus-js/compiler
@zeus-js/compiler-native
@zeus-js/compiler-native-darwin-arm64
@zeus-js/compiler-native-darwin-x64
@zeus-js/compiler-native-linux-arm64-gnu
```

### 从未发布（1）

```
@zeus-js/i18n
```

### 存在但无 rc.3（24）

其余全部，含 4 个 Native 平台包（`linux-x64-gnu`、`linux-x64-musl`、
`win32-arm64-msvc`、`win32-x64-msvc`），它们的 `latest` 停在 2026-08-12 的 canary。

**2026-11-22 的实时结果与 R20 审计（`docs/release/r20-rc-release-audit.md`）一致。**
这是独立复核，不是复用历史结论。

---

## 3. 发布顺序的真实来源（TASK 34 的关键）

**`scripts/release.config.ts` 的 `zeusFixedPackages` 不是发布顺序。**

它只被审计脚本消费（`rc-dry-run.ts`、`check-latest-tags.ts`、`rc-manifest.ts`）。
`@baicie/release` 自己决定顺序：

```js
// node_modules/@baicie/release/dist/index.js:892
return packages.sort((a, b) => {
  if ((a.kind ?? '') !== (b.kind ?? ''))
    return (a.kind ?? '').localeCompare(b.kind ?? '')
  return a.name.localeCompare(b.name)
})
```

`kind` 由 `release.config.ts` 的 `packageKind()` 决定：

| 目录                                 | kind            |
| ------------------------------------ | --------------- |
| `packages/web-c/*`                   | `'web-c'`       |
| `packages/tooling/eslint-plugin`     | **`undefined`** |
| `packages/tooling/playground-engine` | **`undefined`** |
| 其他                                 | `'core'`        |

排序键是 `a.kind ?? ""`，所以 **`undefined` 变成空串，排在最前**。

---

## 4. i18n 从未发布的根因（TASK 34）

### 结论：ROOT_CAUSE_CONFIRMED

按 `(kind ?? "", name)` 重建的真实发布顺序：

```
 1  (none)  @zeus-js/eslint-plugin                     ✓ rc.3
 2  (none)  @zeus-js/playground-engine                 ✓ rc.3
 3  core    @zeus-js/compiler                          ✓ rc.3
 4  core    @zeus-js/compiler-native                   ✓ rc.3
 5  core    @zeus-js/compiler-native-darwin-arm64      ✓ rc.3
 6  core    @zeus-js/compiler-native-darwin-x64        ✓ rc.3
 7  core    @zeus-js/compiler-native-linux-arm64-gnu   ✓ rc.3
 8  core    @zeus-js/compiler-native-linux-x64-gnu     ✗ TLOG 409 在此失败
 9  core    @zeus-js/compiler-native-linux-x64-musl    · 未执行
10  core    @zeus-js/compiler-native-win32-arm64-msvc  · 未执行
11  core    @zeus-js/compiler-native-win32-x64-msvc    · 未执行
12  core    @zeus-js/compiler-shared                   · 未执行
13  core    @zeus-js/i18n                              · 未执行
14-22 core  query, resource, router, runtime-dom,
            runtime-ssr, shared, signal, testing, zeus
23-32 web-c bundler-plugin, component-*, output-*, web-c*
```

**这张表与 registry 的实际状态逐一吻合：**

- 位置 1–7：全部有 rc.3
- 位置 8：失败点
- 位置 9–32：全部没有 rc.3，包括 i18n

### 因此

**i18n 的“从未发布”不是首发逻辑的缺陷。它在第 13 位，发布流程在第 8 位就停了，从未执行到它。**

这与任务描述中的警告一致：「不能把"没有发布"直接当成"首发逻辑有 bug"」。

### 但不是全部无害

`release-pairing/v0.2.0-rc.3.json` 把 i18n 列进 `firstPublish`，说明**它本来会被首次发布**，而那条路径在本次失败中**从未被执行过**。

恢复时的风险因此是：

1. `skipExisting: true` **不会跳过** i18n（registry 上没有它），所以恢复运行会真的尝试首次发布；
2. 首发会把 `latest` 改写成 rc.3——这一点已由 `eslint-plugin` 与 `playground-engine` 验证（二者 `latest` 均为 `0.2.0-rc.3`）；
3. **这条路径从未在真实 registry 上跑过。**

---

## 5. TLOG 409（TASK 35）

### 结论：ROOT_CAUSE_UNCONFIRMED

失败记录（来自 `docs/release/r18.3-rc3-gap-audit.md`，#335）：

```
npm error code TLOG_CREATE_ENTRY_ERROR
npm error error creating tlog entry - (409) an equivalent entry already
  exists in the transparency log with UUID 108e9186e8c5677ad6...
```

两种解释无法区分：

- 同一 tarball 此前已签名但未落库；
- Sigstore 的透明度日志重试语义。

**没有 registry 侧证据能区分这两种。** 本轮不重复猜测。

### 本轮新增的一条事实

失败包 `@zeus-js/compiler-native-linux-x64-gnu` 的 `latest` 仍是
`0.1.1-canary.20260812.106.1.658fe407`（2026-08-12），说明**此后没有任何一次
重试成功过它**。

这排除了「409 自行恢复」的可能，但不说明根因。

### 恢复的前置条件（未变）

1. 409 必须先解决，否则重试会在同一包上持续失败。
2. 重发 tarball 必须与已签名条目一致。

---

## 6. GitHub Release（TASK 39 的一部分）

四个 RC tag 全部存在，**没有一个有对应 Release**：

```
$ gh release view v0.2.0-rc.0  → release not found
$ gh release view v0.2.0-rc.1  → release not found
$ gh release view v0.2.0-rc.2  → release not found
$ gh release view v0.2.0-rc.3  → release not found
```

最近一个 Release 是 `v0.1.1-beta.20`（2026-10-26）。

`v0.2.0-rc.3` tag 指向 `649e2f60`，未被移动。

### 这是否算缺陷？

**本轮不判定。** 需要先回答一个产品问题：**正式发布政策是否要求历史 RC 都有
GitHub Release？**

如果要求 → 这是缺陷，需要补齐方案。
如果不要求（例如 RC 只走 npm `rc` 通道）→ 这是规则，不应继续被报告为缺陷。

**这个问题本轮没有答案，因为它不在仓库的可读证据里。** 记录在此，不擅自决定。

### 历史 canary 占用 `latest` 的风险

4 个 Native 平台包的 `latest` 指向 2026-08-12 的 canary。一个
`npm i @zeus-js/compiler-native-linux-x64-gnu` 的消费者会拿到 canary，不是任何
RC 或稳定版。这是**已确认的风险**，与 Release 政策无关。

---

## 7. `skipExisting` 的恢复语义（TASK 38 的一部分）

`publishOnePackage` 默认 `skipExisting: true`。它的语义是「若 `name@version`
已存在则跳过」——**不检查内容、不检查 provenance、不检查 tag**。

| 情形           | 行为       |
| -------------- | ---------- |
| 已发布同版本   | 跳过       |
| 已发布不同版本 | 发布新版本 |
| 从未发布       | 发布       |

**它保证重跑不失败，不保证重跑补全。** 一次跳过 31 包、发布 0 包的运行会以
退出码 0 结束。

因此恢复报告必须核对**实际发布数**，不能只看退出码。这一条是 TASK 38 的核心
要求，本轮据此记录，未做模拟（隔离 registry 演练未执行，见 §8）。

---

## 8. 本轮未做

| 项                                  | 状态        | 原因                                    |
| ----------------------------------- | ----------- | --------------------------------------- |
| 隔离 registry 演练（TASK 37）       | **NOT_RUN** | 需要 Verdaccio 或等效环境，本轮未搭     |
| skipExisting 模拟（TASK 38 的后半） | **NOT_RUN** | 同上                                    |
| Tarball 与源码一致性（TASK 36）     | **NOT_RUN** | 需要已发布 tarball 的完整下载与哈希比对 |
| Sigstore 侧日志                     | **BLOCKED** | 需要 npm/Sigstore 凭证                  |

这几项都属于「需要额外环境或凭证」的取证，不是可以在本仓库内完成的分析。

---

## 9. 对 RC_RECOVERY_READY 的影响

**不成立。** 阻断项：

1. `0.2.0-rc.3` 只发布了 7/32，且失败点在**第 8 位**——不是零星缺失，是流程中断。
2. TLOG 409 根因未确认，无法保证重试会推进。
3. i18n 的首次发布路径从未在真实 registry 上执行过。
4. 隔离演练与 tarball 一致性取证均未执行（§8）。

**i18n 的原因已经查清**，这是本轮相对 R20 的实质进展：它不再是「未知的疑点」，
而是「已知会被执行、但从未被执行过的下一步」。
