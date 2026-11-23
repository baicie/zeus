# beta.35 发布就绪清单

- 日期：2026-11-23
- 性质：**只读预演**。未打 tag、未 publish、未改生产配置。
- 基线：zeus-ui `main` + `fix/release-protocol-v2` 分支

---

## 结论

**依赖与协议层面已就绪，但有三项必须先落地。**

| #   | 项                          | 状态                                  |
| --- | --------------------------- | ------------------------------------- |
| 1   | 46 个包版本一致             | ✅ 全部 `0.1.0-beta.35`               |
| 2   | `@zeus-js/*` 依赖对齐       | ✅ 全部 `0.2.0-rc.5`，0 异常          |
| 3   | `vite-plugin@0.0.5` 独立线  | ✅ 未被误改                           |
| 4   | Release Protocol 预演       | ✅ `passed (beta, online)`            |
| 5   | publish preflight           | ✅ `0 published, 46 absent, 0 failed` |
| 6   | **发布顺序**                | ⚠️ **修复在 PR 中，未合入 main**      |
| 7   | **pairing 检查在 precheck** | ⚠️ **同上**                           |
| 8   | SBOM                        | ❌ zeus-ui 无此门禁                   |

---

## 1. 版本与依赖（VERIFIED）

```
可发布 @zeus-web 包: 46
版本分布: [('0.1.0-beta.35', 46)]

@zeus-js 依赖版本分布:
  @zeus-js/output-icons          0.2.0-rc.5  x1
  @zeus-js/output-react-wrapper  0.2.0-rc.5  x29
  @zeus-js/output-vue-wrapper    0.2.0-rc.5  x29
  @zeus-js/runtime-dom           0.2.0-rc.5  x29
  @zeus-js/web-c-runtime         0.2.0-rc.5  x29
  @zeus-js/zeus                  0.2.0-rc.5  x30
异常: 无
```

### 1.1 关于 16 个"缺 peer"的包

初查时 16 个包没有声明 `@zeus-js/zeus` peer。**这不是缺陷**：它们没有直接 import
`@zeus-js/zeus`，只依赖 `runtime-dom` / `web-c-runtime`。逐包扫描 `src/` 后，
真实需要而未声明的情况为 **0**。

## 2. `vite-plugin` 独立版本线（VERIFIED）

```
examples/ai-workbench/package.json  -> "0.0.5"
examples/headless/package.json      -> "0.0.5"
$ pnpm zeus:align-beta
No package.json files changed.        # 幂等
```

## 3. exports / types / peerDependencies

46 个包全部有 `exports` 与 `files` 字段。`types` 路径指向 `dist/`，需先构建——
这是发布流程的正常前置，不是缺陷。

## 4. Release Protocol 预演（VERIFIED）

```
$ pnpm check:release-pairing
UI release pairing 0.1.0-beta.35 passed (beta, static)

$ ... --version 0.1.0-beta.35 --core-version 0.2.0-rc.5 --online --release-sha <sha>
UI release pairing 0.1.0-beta.35 passed (beta, online)
```

online 报告内容：

| 字段         | 值                      |
| ------------ | ----------------------- |
| `mode`       | online                  |
| `channel`    | beta                    |
| `coreTag`    | `v0.2.0-rc.5`           |
| `coreCommit` | `bc1d4fc2…`（真实解析） |
| `uiCommit`   | 当前 SHA                |

beta 通道**不需要配对记录**，但**需要 Core tag 解析到 commit**——这是本轮加固后的规则。

## 5. publish preflight（VERIFIED）

```
$ pnpm check:publish-preflight --version 0.1.0-beta.35 --tag beta
publish preflight PASS: 0 published, 46 absent, 0 failed
```

46 个包在 registry 上全部 `ABSENT`，符合首次发布预期。

## 6. 三个必须先落地的项

### 6.1 发布顺序（PR 中）

不定义 `packageKind` 时，`@baicie/release` 按包名排序，**逆序 59 条真实依赖边**：

```
@zeus-web/cli      排在 @zeus-web/registry / themes / icons 之前
@zeus-web/headless 排在 label / separator / skeleton / toast 之前
```

npm 逐个接受 publish，所以这个顺序会留下"已发布的版本依赖一个尚不存在的包"的窗口。

修复在 `fix/release-protocol-v2` 分支，**未合入 main**。合规的发布必须等它合入。

### 6.2 pairing 检查进 precheck（同一 PR）

`release.yml` 要求报告带 Core commit，但该检查原本不在 precheck 里——
问题会在切版本之后才暴露。已加入，且改为可从 workspace 读取版本。

### 6.3 SBOM 缺失

zeus 的 precheck 有 `check:sbom:write` / `check:sbom`，zeus-ui **没有**。

这不是 beta.35 的硬阻塞（npm provenance 已开启），但意味着
`@zeus-web/*` 的 tarball 没有 SBOM 证据。是否补齐需要你决定。

---

## 7. 发布时需要人工确认的动作

| 动作                    | 为什么                           |
| ----------------------- | -------------------------------- |
| 打 `v0.1.0-beta.35` tag | 不可回滚（immutability ruleset） |
| `npm publish`           | 版本不可撤销                     |
| 触发 `release.yml`      | 一旦 dry_run=false 就会真实发布  |

`Release` environment 当前**没有必需审批人**，所以这些确认靠纪律而非技术强制。

---

## 8. 复现命令

```bash
cd zeus-ui

# 版本与依赖
python3 -c "..."   # 见报告 §1

# 协议预演（静态）
pnpm check:release-pairing

# 协议预演（在线，真实解析 Core tag）
npx tsx scripts/checks/release/check-release-pairing.ts \
  --version 0.1.0-beta.35 --core-version 0.2.0-rc.5 \
  --online --release-sha "$(git rev-parse HEAD)"

# 发布前检查
npx tsx scripts/checks/release/check-publish-preflight.ts \
  --version 0.1.0-beta.35 --tag beta

# 发布顺序（修复后应通过）
npx vitest run --project unit scripts/checks/__tests__/release/publish-order.spec.ts
```

## 9. 判定

**依赖与协议已就绪。** 但：

- 6.1 与 6.2 的修复必须先合入 main，否则发布顺序错误 + 预检缺门禁。
- 6.3（SBOM）需要你决定是否补齐。

在这两项处理完之前，**不建议打 tag**。
