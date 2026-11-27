# rc.6 发布记录

时间：2026-11-27
基线：`9353ed74`（main）+ `release/0.2.0-rc.6` 分支
registry：`https://registry.npmjs.org`

---

## 1. 为什么有 rc.6

rc.5 是关键缺陷的最后一个已发布版本：

| 缺陷                              | 修复提交   | 已发布版本是否包含 |
| --------------------------------- | ---------- | ------------------ |
| WebC 导出无法挂载自己定义的元素   | `bf4e2bd6` | **否**（rc.5 无）  |
| 浏览器编译器缺 wasm target 的路径 | `25d3cfda` | 否                 |
| canary 在 wasm 构建前就检查导出   | `bcc3d49b` | 否                 |

实测证据：已发布的 `@zeus-js/playground-engine@0.2.0-rc.5` tarball 中，
修复后的守卫出现 **0** 次，修复前的分支出现 **1** 次。因此 Playground 浏览器
门禁对着 rc.5 不可能变绿——必须发布新版本，不是重跑。

---

## 2. `latest` 历史豁免

rc.6 的 precheck 原先被一条检查拒绝：

```
REFUSED @zeus-js/i18n: precheck found latest at prerelease 0.2.0-rc.5
```

成因不是配置错误：`@zeus-js/i18n` 在 rc.5 是**首次发布**，npm 对首次发布无条件
把 `latest` 绑到该预发布版本，`--tag rc` 不改变这一点。

三条实测事实支持"无法删除"：

1. 本机 token 只读：packument GET 返回 200，PUT dist-tag 返回 401；
2. 环境里没有 `NODE_AUTH_TOKEN` / `NPM_TOKEN`；
3. 即使有写权限，`DELETE /-/package/<pkg>/dist-tags/latest` 对同样的读写凭据
   返回 E403（`meta/release/historical-latest.json` 的 `evidence.repairFailure`
   记录了 5 次 workflow 尝试）。

且 `i18n` 没有稳定版本可把 `latest` 指过去：Registry 上只有 `0.0.0-stage`
与 `0.2.0-rc.5`，前者同样是预发布。仓库内没有任何机制能清除这个标签。

维护者于 2026-11-27 授权：将该偏差按**精确版本**记入 `meta/release/historical-latest.json`，
不把删除历史 `latest` 作为 rc.6 的前置条件。授权范围只覆盖
`@zeus-js/i18n@0.2.0-rc.5` 这一条。

**没有做的事**：未修改 `check-latest-tags.ts` 的判定逻辑；未让 precheck 读取
当前 pairing record；未新增豁免参数；未把 `latest` 指向 `0.0.0-stage`；
未发布伪稳定版本来覆盖 `latest`。

---

## 3. 基线的真实条目数

历史文档写 13 条，实际是 15 条（8 native + 5 canary 时代 runtime + 2 rc.3 首发
工具包）。加上本次的 `i18n` 共 **16** 条。文档已按实际值修正。

| 类别        | 数量 | 包                                                                     |
| ----------- | ---- | ---------------------------------------------------------------------- |
| canary 污染 | 13   | 8 native + `runtime-ssr` / `router` / `resource` / `query` / `testing` |
| 首发绑定    | 3    | `eslint-plugin`（rc.3）、`playground-engine`（rc.3）、`i18n`（rc.5）   |

---

## 4. 真实 Registry precheck 结果

```
latest-tag census: 32 packages (16 stable, 16 prerelease, 0 absent, 0 failed)
latest policy (precheck): ACCEPTED_HISTORICAL
  (16 historical, 0 first-publish, 0 refused, 0 unknown)
```

退出码 0。16 条全部为精确匹配，refused 与 unknown 均为 0。

---

## 5. 版本切换覆盖面

`version-rehearsal --version 0.2.0-rc.6 --apply` 改写 **39 个文件 / 44 处编辑**，
含 32 个固定发布包装配、根 `package.json`、`Cargo.toml`、以及 create-zeus 六个模板。

它**不覆盖**的两处已手工补齐（这是已知缺口）：

| 缺口                              | 补齐方式                                                         | 验证                   |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| `Cargo.lock` 三个 crate 仍是 rc.5 | `cargo update -p zeus_compiler --offline`                        | 三个 crate 全部 → rc.6 |
| native loader 硬编码期望版本      | `pnpm exec tsx scripts/release/sync-native-loader.ts 0.2.0-rc.6` | 52 处 rc.6、0 处 rc.5  |

派生文档 `docs/api/packages.md` 由 `pnpm write:package-table` 重新生成（32 处 → rc.6）。

独立版本线的包**未**被机械升级，已逐一核对保持原值：
`@zeus-js/vite-plugin` 0.0.6、`@zeus-js/compiler-wasm` 0.1.1-beta.20、
`create-zeus` 0.1.5、`zeus-ui` 0.0.1。

---

## 6. 本机 precheck 的边界

`release:precheck` 共 33 条命令。本机（darwin-arm64）能真实执行 **31** 条，
全部通过。跳过 2 条，原因是它们要求全部 8 个平台的 `.node` 二进制，
而单机只能产出本平台的：

| 跳过                                         | 原因                                |
| -------------------------------------------- | ----------------------------------- |
| `check:native-binaries`                      | 缺 darwin-x64 等 7 个平台的 `.node` |
| `check:release-artifacts --require-binaries` | 同上                                |

CI 的 `release` job 通过 `native-prebuild` → `download native platform artifacts` →
`native:restore:artifacts` 满足这两步，本机无法复现。**因此这两条的真实结论
只有在 CI 上才算数**，本记录不把它们声称为已通过。

另有一条本机环境约束：仓库要求 `engines.node = ^22.18.0 || >=24.11.0`，而本机
默认 shell 是 Node 22.12.0。`build-dts` 在这个版本下报
`Unknown file extension ".ts"` 并失败——这是 `.bin/rollup` wrapper 没有走 tsx
的环境问题，不是代码缺陷。用 `.node-version` 指定的 24.16.0 重跑即通过，
后续全部 precheck 步骤都在该版本下执行。

---

## 7. 发布后的核对（待填）

- [ ] 32 包精确版本 = 0.2.0-rc.6
- [ ] `rc` dist-tag 指向 0.2.0-rc.6
- [ ] `latest` 对 16 条历史豁免外无新偏差
- [ ] tarball integrity 与 provenance 通过
- [ ] 8 个平台二进制齐备
- [ ] 真实下游安装（fixtures/published-consumer）

---

## 8. 配对协议：rc.6 卡在一个真实的循环上

这一节记录的是**尚未解决**的问题，不是已完成的步骤。

### 8.1 为什么 rc.6 既不能 bootstrap，也不能 recovery

`.github/workflows/release.yml` 的 "Read the paired UI commit" 要求
`meta/release/pairing/v0.2.0-rc.6.json` 里有一个 40 位的 `uiCommit`。两种例外都不成立：

| 例外      | 适用条件                                  | rc.6 的实际情况                                         |
| --------- | ----------------------------------------- | ------------------------------------------------------- |
| bootstrap | 版本线的**首个** RC，且该线无已发布预发布 | rc.1–rc.5 均已发布，`bootstrap-eligibility.ts` 明确拒绝 |
| recovery  | 前一个 RC **失败且未发布任何产物**        | rc.5 成功发布，不满足                                   |

`bootstrap-eligibility.ts` 的拒绝文案是直接命中的：

> `0.2.0 already has published prereleases (0.2.0-rc.1, …, 0.2.0-rc.5); bootstrap is for a new version line, and a line that has shipped an RC already has its pairing path`

### 8.2 循环在哪

`meta/release/pairing/README.md` 已经写明这个结构：

> `@zeus-js/*@<new version>` is not on the registry, so the UI lockfile cannot resolve — blocks the UI commit that the record must name
> The record must be in the tagged commit — blocks the Core tag
> Each needs the other's output. That is the deadlock.

文档给出的解法是「bootstrap 打破首次循环，之后**同版本线内** pins 不变、lockfile 已有效，记录可以在 tag 前写好」。

rc.5 → rc.6 不属于「同版本线内 pins 不变」的情况：它跨 rc，UI 的 pins 必须从 rc.5 改到 rc.6，而 rc.6 尚未发布。

### 8.3 一个可能的出口（未执行）

`check:ui-pairing` 实测**不校验 lockfile 能否解析**，只校验 UI 树里每个
`@zeus-js/*` 依赖的版本字符串等于 `coreVersion`，以及 commit / 工作树干净。
这意味着一个只改版本字符串、不重新安装的 UI commit 可以通过配对校验。

这条路径的代价必须说清楚：它会产生一个**其 lockfile 无法用已发布包解析**的 UI commit，
并将其记为 rc.6 的配对对象。这不是"已配对"，只是"校验能过"。

### 8.4 需要维护者决定

- 方案 A：按 8.3 制造 UI 配对 commit，rc.6 走完整配对路径发布。
- 方案 B：先不发布 rc.6，改为让 rc.6 也走 recovery/bootstrap 之外的其他授权路径（需要新增机制，本记录不假设存在）。

在决定之前，rc.6 **未**提交 tag、**未**触发发布。
