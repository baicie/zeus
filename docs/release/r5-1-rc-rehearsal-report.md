# R5.1 Phase D：真实离线 RC 发布预演报告

- 日期：2026-11-08
- 状态：**REHEARSAL_PASS**
- 分支：`feat/r51-rc-rehearsal`
- 预演 HEAD：`b8322e7f3b3c1aee95f32e0262053412070557f6`
- 基线：`fdeb87be04c4f9d777c790a74821922892d7b5cf`
- 版本：`0.2.0-rc.0`
- 配对 UI：`baicie/zeus-ui` @ `c3714eda374c10dea2c7b6c6968d7a863b374e21`（`0.1.0-beta.35`）
- 预演工作区：`temp/worktrees/r51-rehearsal`
- 环境：macOS Darwin 24.6.0 / arm64，Node `v22.12.0`，pnpm `10.33.4`

## 1. 范围与边界

本次预演验证 RC 候选的真实可打包性、可安装性与可构建性：

- 将 31 个 Core 固定发布包与独立版本的 `@zeus-js/vite-plugin` 改写为 `0.2.0-rc.0`。
- 改写 create-zeus 六个模板中的 `@zeus-js/*` 精确 pin。
- 运行仓库既有的 install / build / dts / 版本一致性 / 候选打包门禁。
- 打包 32 个 Core 候选 tarball，并校验名称、版本与 sha256。
- 使用配对 UI 的 `@zeus-web/*` 候选构建六个 create-zeus 模板。
- 结束后通过 `git restore` 恢复版本改写，并验证工作区干净。

明确未执行：

- 未执行 `npm publish`。
- 未创建 Git Tag。
- 未触发正式 Release Workflow。
- 未验证其他操作系统/CPU 架构的 native 二进制。

## 2. 环境与平台适配

| 项目          | 值                                                       |
| ------------- | -------------------------------------------------------- |
| 平台          | `darwin` / `arm64`                                       |
| Node          | `v22.12.0`（低于仓库 engines `^22.18.0 \|\| >=24.11.0`） |
| pnpm          | `10.33.4`                                                |
| native 二进制 | 从主工作区复制 `zeus-compiler-native.darwin-arm64.node`  |
| Node 适配     | `NODE_OPTIONS=--import tsx`，仅用于 `pnpm build-dts`     |

Node `22.12.0` 下 Rollup 无法直接加载 `scripts/bundler/rollup.dts.config.ts`，首次预演因此真实失败：

```text
TypeError [ERR_UNKNOWN_FILE_EXTENSION]: Unknown file extension ".ts"
for .../scripts/bundler/rollup.dts.config.ts
```

使用仓库本地依赖 `tsx` 作为 loader 后 `pnpm build-dts` 通过。该适配只作用于 `build-dts` 步骤；若全局注入，会让尚未安装 `tsx` 的配对 UI checkout 的 `pnpm install` 失败（第二轮预演真实复现）。

## 3. 复现命令

```bash
# 1. 在隔离 worktree 安装依赖
cd temp/worktrees/r51-rehearsal
pnpm install --frozen-lockfile

# 2. 复制本机可用的 native 二进制
cp /Users/liuzhiwei/Desktop/workspace/git-code/zeus/packages/core/compiler-native-darwin-arm64/zeus-compiler-native.darwin-arm64.node \
  packages/core/compiler-native-darwin-arm64/

# 3. 准备固定 SHA 的配对 UI（短临时路径，避免 pnpm ENAMETOOLONG）
git clone --depth 1 https://github.com/baicie/zeus-ui /tmp/zui-r51
cd /tmp/zui-r51
git fetch --depth 1 origin c3714eda374c10dea2c7b6c6968d7a863b374e21
git checkout --detach FETCH_HEAD
cd -

# 4. 执行完整离线预演
pnpm exec tsx scripts/release/rc-rehearsal.ts \
  --version 0.2.0-rc.0 \
  --expect-head b8322e7f3b3c1aee95f32e0262053412070557f6 \
  --ui-root /tmp/zui-r51 \
  --node-options=--import tsx \
  --out temp/release/rc-rehearsal.json

# 5. 验证恢复结果
git status --porcelain   # 必须为空
```

注意：`--node-options` 的值以 `-` 开头，必须使用 `--node-options=--import tsx` 形式，否则 Node `parseArgs` 会拒绝。

## 4. 步骤结果

| 步骤                         | 状态 | 耗时   | 关键结果                                             |
| ---------------------------- | ---- | ------ | ---------------------------------------------------- |
| `preflight-clean`            | PASS | 0 ms   | git status --porcelain 为空                          |
| `preflight-head`             | PASS | 0 ms   | b8322e7f3b3c1aee95f32e0262053412070557f6             |
| `preflight-version`          | PASS | 0 ms   | 0.2.0-rc.0                                           |
| `version-rewrite`            | PASS | 1.5 s  | 37 个文件，46 处改写                                 |
| `ui-pin-sync`                | PASS | 288 ms | 1 个文件同步到 UI 0.1.0-beta.35                      |
| `install`                    | PASS | 14.8 s | 依赖安装完成                                         |
| `build`                      | PASS | 31.2 s | pnpm build 完成                                      |
| `build-dts`                  | PASS | 6.5 s  | 声明构建完成（tsx loader）                           |
| `check-package-versions`     | PASS | 4.4 s  | package versions aligned: 0.2.0-rc.0                 |
| `check-create-zeus-versions` | PASS | 1.2 s  | templates verified for 0.2.0-rc.0 / UI 0.1.0-beta.35 |
| `candidate-prepare`          | PASS | 50.1 s | 32 个 Core tarball 打包并校验                        |
| `ui-install`                 | PASS | 82.7 s | 配对 UI 依赖安装完成                                 |
| `ui-build-button`            | PASS | 7.4 s  | button 闭包构建完成                                  |
| `candidate-matrix`           | PASS | 42.3 s | 6/6 模板安装并构建                                   |
| `tarball-validation`         | PASS | 0 ms   | 32/32 tarball，名称/版本/sha256 全部匹配             |
| `restore`                    | PASS | 402 ms | 仅恢复被改写的版本路径                               |
| `verify-clean`               | PASS | 646 ms | git status --porcelain 为空                          |

## 5. 版本改写与恢复

- `scripts/release.config.ts` 的 31 个 `zeusFixedPackages` 与 `@zeus-js/vite-plugin`：共 32 个 `package-version` 改写。
- create-zeus 模板 `@zeus-js/*` 精确 pin：14 个 `template-pin` 改写，覆盖 `basic-ts`、`application-ts`、`admin-ts`、`web-component-ts`、`component-library-ts`；`webc-consumer-ts` 没有 `@zeus-js/*` 直接依赖。
- 根 `package.json` 保持 `0.1.1-beta.20` 未修改；发布版本源为 `@zeus-js/zeus`。
- 配对 UI pin 同步：`webc-consumer-ts` 的 `@zeus-web/button` 从 `0.1.0-beta.34` 同步到 `0.1.0-beta.35`，对应 release 配置中 `ZEUS_UI_VERSION` 的 `afterVersion` 语义。
- 共改写 37 个文件、46 处版本值（`temp/release/version-rehearsal.json`）；`ui-pin-sync` 另外改写 1 个模板文件、1 处 UI pin。
- 预演结束时 `git restore --worktree` 仅恢复上述 38 个路径；`git status --porcelain` 为空。

预演过程中发现并修复的发布链问题：

1. `scripts/check/prepare-create-zeus-candidate.ts` 与 `scripts/release/create-zeus-versions.ts` 的默认版本源原本读取私有根 `package.json`。RC 预演不修改根版本，因此这两处改为读取 `packages/core/zeus/package.json` 的 `@zeus-js/zeus` 版本。
2. `prepare.json` 中 tarball 的 `file` 字段是 basename，不是绝对路径。预演校验器现在按 `archives` 目录解析相对文件名。
3. create-zeus 模板的 `@zeus-web/*` pin 需要跟随配对 UI 版本。预演新增 `ui-pin-sync` 步骤，显式报告改写文件与 mismatch。
4. Node `22.12.0` 加载 `.ts` Rollup 配置的限制通过 `NODE_OPTIONS=--import tsx` 解决，且只作用于 `build-dts`。

## 6. 31+1 Core 候选包矩阵

全部 32 个 tarball 的版本均为 `0.2.0-rc.0`，名称集合完整，无缺失或多余包。sha256 由预演脚本对实际 tarball 重新计算。

|   # | 包                                          | 版本         | Tarball                                                   | sha256                                                             |
| --: | ------------------------------------------- | ------------ | --------------------------------------------------------- | ------------------------------------------------------------------ |
|   1 | `@zeus-js/shared`                           | `0.2.0-rc.0` | `zeus-js-shared-0.2.0-rc.0.tgz`                           | `c22287daf5eab605331e706c3cf6e610ef9d911591d6fe5c5f14da5b73e14dab` |
|   2 | `@zeus-js/compiler-shared`                  | `0.2.0-rc.0` | `zeus-js-compiler-shared-0.2.0-rc.0.tgz`                  | `64896b90b0857385a48d0c8dbf600be90d1c137e26603f9539f710479786af1d` |
|   3 | `@zeus-js/compiler-native`                  | `0.2.0-rc.0` | `zeus-js-compiler-native-0.2.0-rc.0.tgz`                  | `dfeba3856c780ecac667e28b4a46c1bd6277f2c75edb942deabe4bcb19c6fe2b` |
|   4 | `@zeus-js/compiler-native-darwin-arm64`     | `0.2.0-rc.0` | `zeus-js-compiler-native-darwin-arm64-0.2.0-rc.0.tgz`     | `3cd296a214a7de99bcb091ddc74481251b5734285c6551f007ae5c4e5b77f47b` |
|   5 | `@zeus-js/compiler-native-darwin-x64`       | `0.2.0-rc.0` | `zeus-js-compiler-native-darwin-x64-0.2.0-rc.0.tgz`       | `daa56b94921d9d1c372e7d0fb635fdedbe8ff090c305fd3b3e8a5a59ce858e2f` |
|   6 | `@zeus-js/compiler-native-linux-arm64-gnu`  | `0.2.0-rc.0` | `zeus-js-compiler-native-linux-arm64-gnu-0.2.0-rc.0.tgz`  | `cbe915d3958b50bc7f6417a35053e21cffeddf12884144dc34206048376b5e20` |
|   7 | `@zeus-js/compiler-native-linux-x64-gnu`    | `0.2.0-rc.0` | `zeus-js-compiler-native-linux-x64-gnu-0.2.0-rc.0.tgz`    | `cb96aa84bf4199b35d582d6e12188044748b67b29168265da684e95dfa297373` |
|   8 | `@zeus-js/compiler-native-linux-x64-musl`   | `0.2.0-rc.0` | `zeus-js-compiler-native-linux-x64-musl-0.2.0-rc.0.tgz`   | `9b431bc55bc8a30d07d1e6b01ae3069185549534e36cb94ba45207038aab791e` |
|   9 | `@zeus-js/compiler-native-win32-arm64-msvc` | `0.2.0-rc.0` | `zeus-js-compiler-native-win32-arm64-msvc-0.2.0-rc.0.tgz` | `a7c901323d17e117519866c584d03fa3cae79c39b93c2e70b47d0c76c1f4a1c1` |
|  10 | `@zeus-js/compiler-native-win32-x64-msvc`   | `0.2.0-rc.0` | `zeus-js-compiler-native-win32-x64-msvc-0.2.0-rc.0.tgz`   | `2116540e86a7d8a2258becd9efa953ee698ad85b7285e9b113b0fc3bf8b41458` |
|  11 | `@zeus-js/signal`                           | `0.2.0-rc.0` | `zeus-js-signal-0.2.0-rc.0.tgz`                           | `a156a2ef9531a9d59dedcdc255bb259dd4861c300b53d6feffbd56f7b2f20204` |
|  12 | `@zeus-js/runtime-dom`                      | `0.2.0-rc.0` | `zeus-js-runtime-dom-0.2.0-rc.0.tgz`                      | `2d7ac056fe4a28f68ad17aaf47998b1f19a99c76bae217f01ba704838bd899f3` |
|  13 | `@zeus-js/runtime-ssr`                      | `0.2.0-rc.0` | `zeus-js-runtime-ssr-0.2.0-rc.0.tgz`                      | `f769d0434262d69111da00b3327f25c3d390ccc6c0852dfb5843ae251f62c37b` |
|  14 | `@zeus-js/router`                           | `0.2.0-rc.0` | `zeus-js-router-0.2.0-rc.0.tgz`                           | `9a47c91f61e2e9ec9baf5494a1aa891b485cbafaa8c64af515aef7545cdbb669` |
|  15 | `@zeus-js/resource`                         | `0.2.0-rc.0` | `zeus-js-resource-0.2.0-rc.0.tgz`                         | `e316ba0f8b6eff123593ec046eed73a230cdbb252754edfd1cec1c4f79be1138` |
|  16 | `@zeus-js/query`                            | `0.2.0-rc.0` | `zeus-js-query-0.2.0-rc.0.tgz`                            | `02740030adcf23674ee55280fc708bd3c5c5df6a02c5f859161976cd25ff8f7d` |
|  17 | `@zeus-js/compiler`                         | `0.2.0-rc.0` | `zeus-js-compiler-0.2.0-rc.0.tgz`                         | `deb5250d7b7ec5c921cad4a20556a9ade0603644314a6ef7c1e463d3370683f1` |
|  18 | `@zeus-js/zeus`                             | `0.2.0-rc.0` | `zeus-js-zeus-0.2.0-rc.0.tgz`                             | `8c983f100d53db42495bcc9e39a1ee6e07c5d1d5e9d1e028ad06f7d73238daf6` |
|  19 | `@zeus-js/testing`                          | `0.2.0-rc.0` | `zeus-js-testing-0.2.0-rc.0.tgz`                          | `7ee0970ae930ad9e6a701867a003d97677a7ad227d09a23d982acbe6701f5f15` |
|  20 | `@zeus-js/bundler-plugin`                   | `0.2.0-rc.0` | `zeus-js-bundler-plugin-0.2.0-rc.0.tgz`                   | `9a929f7e17d20430c2427c99122b613dc39782a619beba3dbcde00edf028d522` |
|  21 | `@zeus-js/component-analyzer`               | `0.2.0-rc.0` | `zeus-js-component-analyzer-0.2.0-rc.0.tgz`               | `3a44fc99626445782b9f2c7c7f3b2ede2ff39c9f5c5b9d9ccc63c8d65f95360d` |
|  22 | `@zeus-js/component-dts`                    | `0.2.0-rc.0` | `zeus-js-component-dts-0.2.0-rc.0.tgz`                    | `4b9c81a0781b8189fae41aa3e835eedf025bf4cd8eda7e239146920f9b31ca73` |
|  23 | `@zeus-js/web-c-runtime`                    | `0.2.0-rc.0` | `zeus-js-web-c-runtime-0.2.0-rc.0.tgz`                    | `77307ba5c87a9c25739090c88d0745307918d047bee627c666d32b36ce493675` |
|  24 | `@zeus-js/web-c`                            | `0.2.0-rc.0` | `zeus-js-web-c-0.2.0-rc.0.tgz`                            | `c6d3fd2cc8d544b42e93b1b4437269956c1ae00ae344b39ed750fd97602b7d00` |
|  25 | `@zeus-js/output-wc`                        | `0.2.0-rc.0` | `zeus-js-output-wc-0.2.0-rc.0.tgz`                        | `56f4c39d3b7d06061f63edfdede12780f9c564ad432a769c5a81b54cebd17212` |
|  26 | `@zeus-js/output-react-wrapper`             | `0.2.0-rc.0` | `zeus-js-output-react-wrapper-0.2.0-rc.0.tgz`             | `6580e2aacf1a654c836703414e0db94ab5253124183b99ea8666b0de4908ddb0` |
|  27 | `@zeus-js/output-vue-wrapper`               | `0.2.0-rc.0` | `zeus-js-output-vue-wrapper-0.2.0-rc.0.tgz`               | `ed4211178b1d830281ad13bc95f817dca53ae4ba641050bd522c339df2d03c79` |
|  28 | `@zeus-js/output-css`                       | `0.2.0-rc.0` | `zeus-js-output-css-0.2.0-rc.0.tgz`                       | `761030d4c1f989e67f2a8639bd2bd09f05fa8e2b563346d3f921c1d5797faeaf` |
|  29 | `@zeus-js/output-icons`                     | `0.2.0-rc.0` | `zeus-js-output-icons-0.2.0-rc.0.tgz`                     | `91755020683478a9c013328b51b0894d984041a396d341de35be2737bfc733ed` |
|  30 | `@zeus-js/eslint-plugin`                    | `0.2.0-rc.0` | `zeus-js-eslint-plugin-0.2.0-rc.0.tgz`                    | `9343cef9bfa180065472fdfa11c0194ab34d31eba55c52780172db95c97f2c98` |
|  31 | `@zeus-js/playground-engine`                | `0.2.0-rc.0` | `zeus-js-playground-engine-0.2.0-rc.0.tgz`                | `a8fae458bfb27c457f3cdedaea347659f18c830fafa5ae9577acaa185c11d272` |
|  32 | `@zeus-js/vite-plugin`                      | `0.2.0-rc.0` | `zeus-js-vite-plugin-0.2.0-rc.0.tgz`                      | `e589570ecf2543c4577e5cacacb8ef660672cbcc8929db5a0b9bb46eb1a0cc99` |

## 7. 六模板安装与构建结果

六个模板均从隔离候选 tarball 安装并完成 `tsc --noEmit` 与 `vite build`；带 `test` 脚本的模板同时执行了 `vitest run`。`--require-pin-match` 未报告 Core/UI pin 漂移。

| 模板                   | 结果 | 安装版本                         | 构建产物                                                                                                                                                                                                           |
| ---------------------- | ---- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `basic-ts`             | PASS | `@zeus-js/zeus@0.2.0-rc.0`       | `dist/index.html`<br>`dist/assets/index-*.js`                                                                                                                                                                      |
| `application-ts`       | PASS | `@zeus-js/zeus@0.2.0-rc.0`       | `dist/index.html`<br>`dist/assets/index-*.js`                                                                                                                                                                      |
| `admin-ts`             | PASS | `@zeus-js/zeus@0.2.0-rc.0`       | `dist/index.html`<br>`dist/assets/index-*.js`                                                                                                                                                                      |
| `web-component-ts`     | PASS | `@zeus-js/zeus@0.2.0-rc.0`       | `dist/index.html`<br>`dist/assets/index-*.js`                                                                                                                                                                      |
| `component-library-ts` | PASS | `@zeus-js/zeus@0.2.0-rc.0`       | `dist/custom-elements.json`<br>`dist/zeus.components.json`<br>`dist/wc/auto.js`<br>`dist/wc/index.js`<br>`dist/wc/z-greeting.entry.js`<br>`dist/react/index.js`<br>`dist/vue/index.js`<br>`dist/assets/index-*.js` |
| `webc-consumer-ts`     | PASS | `@zeus-web/button@0.1.0-beta.35` | `dist/index.html`<br>`dist/assets/index-*.js`                                                                                                                                                                      |

候选矩阵报告保存在 `temp/create-zeus-candidate/report.json`（`passed: true`）。

## 8. 失败项与未覆盖项

最终运行无失败项。前三次预演的真实失败或中止及处理如下，均不计入 PASS；第四次完整运行通过：

| 轮次            | 失败步骤             | 真实原因                                                   | 处理                             |
| --------------- | -------------------- | ---------------------------------------------------------- | -------------------------------- |
| 第 1 轮         | `build-dts`          | Node 22.12 无法加载 `.ts` Rollup 配置                      | 增加 `NODE_OPTIONS=--import tsx` |
| 第 2 轮         | `ui-install`         | 全局注入的 tsx loader 在 UI checkout 中找不到 `tsx`        | 将 loader 限定到 `build-dts`     |
| 第 2 轮         | `tarball-validation` | `prepare.json` 的 `file` 为 basename                       | 按 `archives` 目录解析           |
| 第 3 轮（中止） | 候选矩阵前置检查     | 模板 `@zeus-web/button` pin 为 beta.34，配对 UI 为 beta.35 | 增加 `ui-pin-sync`               |

平台与范围限制：

- 仅验证 `darwin/arm64`。其他平台的 native 平台包在本次打包中没有对应二进制，因此这些 tarball 不能代表正式多平台发布产物。
- 仅使用本机 Node `22.12.0`，未验证 engines 声明的 Node `22.18+` / `24.11+`。
- 六模板使用 npm registry 安装非 Zeus 依赖，因此本预演不是完全断网环境；Zeus Core/UI 依赖均来自本地候选 tarball。
- 未验证 npm provenance、dist-tag、GitHub Release、publish 权限或发布后的 registry 回读。

## 9. 产物与结论

- 预演报告：`temp/release/rc-rehearsal.json`（`zeus.rc-rehearsal/v1`）
- 版本改写报告：`temp/release/version-rehearsal.json`（`zeus.version-rehearsal/v1`）
- 候选清单：`temp/create-zeus-candidate/candidates.json`
- 候选打包报告：`temp/create-zeus-candidate/prepare.json`
- 六模板报告：`temp/create-zeus-candidate/report.json`
- 命令日志：`temp/release/logs/`

以上 `temp/` 产物被 `.gitignore` 忽略，不进入提交；本文件与预演脚本、测试进入本地提交。

**最终结论：REHEARSAL_PASS。** 在 `b8322e7f3b3c1aee95f32e0262053412070557f6` 上，31+1 个 Core 候选包全部以 `0.2.0-rc.0` 打包并通过名称/版本/sha256 校验，六个 create-zeus 模板全部从隔离候选 tarball 安装并构建成功，版本改写已完整还原，工作区干净。
