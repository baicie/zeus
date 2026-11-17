# R14.1 — 首次 RC 的跨仓库引导死锁

生成时间：2026-11-17
范围：Core `0.2.0-rc.0` 首次发布、UI `0.2.0-rc.0` 配对

## 1. 死锁是什么

两个阻塞分别卡住不同的步骤，所以调换顺序解决不了：

| 阻塞                                                                      | 卡住                             | 解开条件                 |
| ------------------------------------------------------------------------- | -------------------------------- | ------------------------ |
| `@zeus-js/*@0.2.0-rc.0` 不在 registry 上，UI 的 `pnpm-lock.yaml` 无法解析 | 配对记录必须命名的那个 UI commit | 先发布 Core 包           |
| 配对记录必须在被 tag 的 commit 里                                         | Core 的 tag                      | 先有一个存在的 UI commit |

`.github/workflows/release.yml` 在 "Read the paired UI commit" 步骤读记录，该步骤在第 90 行；发布在第 203 行。workflow 由 `v*` tag 触发，所以记录必须已经在 tag 指向的 commit 内。

**这不是顺序错误，是环。**

## 2. 先前 README 的错误

`release-pairing/README.md` 曾写着：

1. Core 发布 RC
2. UI 切 pins 并重新生成 lockfile
3. Core 记录 UI 候选并 tag 包含它的 commit

第 1 步的 tag 指向一个没有记录的 commit，workflow 在第 90 行就失败，永远到不了发布。而 R13.1 配置的 tag ruleset 让 tag 不可删除、不可移动，所以连重试的机会都没有。

已在下述改动中纠正。

## 3. 隔离 Registry 实验

### 3.1 环境

- Verdaccio 6.11.2，`127.0.0.1:4874`
- Core 源码：`origin/main` 的 worktree，切到 `0.2.0-rc.0`
- UI 源码：`ca8cf2c8` 的 worktree

### 3.2 打包器的确定性

这是整个方案能否成立的关键。对同一份源码反复打包 `@zeus-js/output-wc@0.2.0-rc.0`：

| 工具           | 5 次打包           | 协议重写                                        | 结论         |
| -------------- | ------------------ | ----------------------------------------------- | ------------ |
| `pnpm pack`    | 3 种不同 integrity | 正确（`workspace:*` → 真实版本）                | **非确定**   |
| `npm pack`     | 5 次相同           | **错误**（`catalog:` / `workspace:*` 原样泄漏） | 确定但不可用 |
| `pnpm publish` | 3 次相同           | 正确                                            | **两者兼具** |

`pnpm pack` 的非确定性来源是重写 `workspace:*` 时重建 dependencies 对象，键序不稳定。连续三次打包的键序：

```
run1: bundler-plugin, component-analyzer, runtime-dom, component-dts, web-c-runtime
run2: bundler-plugin, component-analyzer, component-dts, runtime-dom, web-c-runtime
run3: bundler-plugin, component-dts, runtime-dom, component-analyzer, web-c-runtime
```

不含 `workspace:` 依赖的包（如 `@zeus-js/signal`）三次打包完全一致，进一步确认根因。

### 3.3 lockfile 的可移植性

`pnpm-lock.yaml`（lockfileVersion 9.0）只存 `integrity`，**不存 registry URL**：

```
'@zeus-js/zeus@0.2.0-rc.0':
  resolution: {integrity: sha512-sPdbZ41ejPwLsraq3FnT6fIKWLaKsyVAf+chXl57YDQSRe9TPhon2WvkLJJfUumDybeUFyltldNSYMCiZQWhKw==}
```

对隔离 registry 生成的锁文件执行 `grep -c "127.0.0.1"` 返回 0。锁文件可以原样提交，不含任何临时地址。

### 3.4 integrity 三方一致性

对 `@zeus-js/output-wc@0.2.0-rc.0`：

| 来源                           | integrity          |
| ------------------------------ | ------------------ |
| `npm pack` 产物                | `sha512-oxCtE6jC…` |
| `npm publish` 后 registry 存储 | `sha512-oxCtE6jC…` |
| 干净消费者安装成功             | ✅                 |

`pnpm publish` 上传的就是它算出的 tarball 字节，registry 不会重新打包。

### 3.5 干净消费者复现

```
$ node -e "import('@zeus-js/zeus').then(...)"
signal memo effect: 6,21
exports: ErrorBoundary, For, Host, Portal, Show, Slot, Transition, batch
```

`createSignal(2)` → `createMemo(n*3)` → `createEffect` 得 `6`；`setN(7)` 后得 `21`。

### 3.6 对真实 npmjs 的负向验证

用生成的锁文件对着 `https://registry.npmjs.org/` 安装：

```
ERR_PNPM_FETCH_404  GET https://registry.npmjs.org/@zeus-js/compiler-native/-/compiler-native-0.2.0-rc.0.tgz
```

失败干净、指向明确，没有静默降级到别的版本。这正是期望行为：锁文件在包真正发布前不可用，发布后即可用。

## 4. 结论：预生成锁文件可行，但有一个前提

技术上可行，前提是 tarball 必须由 `pnpm publish` 产出，而不是 `pnpm pack`。这带来一个新的约束：

**预生成锁文件所用的 tarball，必须与真实发布产生的 tarball 逐字节相同。** 而 `pnpm publish` 的确定性只在同一份源码、同一个 pnpm 版本、同一组依赖解析结果下成立。版本切换会改变源码，所以锁文件只能在版本切换**之后**、发布**之前**由同一个 commit 生成。

这使 Bootstrap 阶段仍然必需：锁文件不能先于发布存在，而配对记录不能后于 tag 存在。

## 5. 顺带发现的三个缺陷

### 5.1 `version-rehearsal` 改写了 vite-plugin 版本（已修）

`version-rehearsal --apply --version 0.2.0-rc.0` 把 `@zeus-js/vite-plugin` 从 `0.0.5` 改成 `0.2.0-rc.0`，并把 4 个 create-zeus 模板的 pin 一起改。

`docs/release/0.2.0-rc-version-matrix.md` 明确要求「保持 `0.0.5`，不并入」，`create-zeus-versions.ts` 也从 vite-plugin 自己的 manifest 推导模板 pin。两个实现直接冲突：rehearsal 改完，`create-zeus-versions --check` 立刻报错——报的正是 rehearsal 刚写的树。

修复：`collectTargetPackages` 不再并入 vite-plugin，模板循环跳过它的 pin。新增 2 个回归测试，对旧实现均失败。

### 5.2 `version-rehearsal` 不调用 `syncNativeLoader`（未修，已记录）

`release.config.ts` 的 `afterVersion` 钩子会调用 `syncNativeLoader` 和 `syncCreateZeusVersions`。`version-rehearsal` 是独立实现，只做了版本号替换，不调用这两个。

后果：rehearsal 后的树，`packages/core/compiler-native/index.js` 仍硬编码 `0.1.1-beta.20`（52 处），包能装但 import 时抛 `Native binding package version mismatch`。

`check:native-loader-version` 会检测到，但那是事后门禁，不是修复。真实发布走 `afterVersion`，不受影响；只有用 rehearsal 做本地演练时会踩到。

### 5.3 UI 候选 `ca8cf2c8` 漏切 `examples/ai-workbench`（未修，已记录）

`examples/ai-workbench/package.json` 仍钉 `@zeus-js/runtime-dom: 0.1.1-beta.20` 和 `@zeus-js/zeus: 0.1.1-beta.20`，而 UI 其余 46 个包已切到 `0.2.0-rc.0`。

隔离 registry 立刻暴露了它：

```
ERR_PNPM_NO_MATCHING_VERSION  No matching version found for @zeus-js/signal@0.1.1-beta.20
while fetching it from 127.0.0.1:4874
This error happened while installing the dependencies of @zeus-js/zeus@0.1.1-beta.20
 at @zeus-js/runtime-ssr@0.1.1-beta.20
```

这说明 UI 侧的版本切换从未真正完成——`ca8cf2c8` 只是部分切换。

## 6. 未验证项

- 真实 npmjs 上的首次发布（禁止 npm publish）
- Tag ruleset 在真实 tag 推送时的行为（已用测试 ref 验证，但未在真实发布路径验证）
- 7 个平台包的跨平台安装
- Node 22.18 / 24.11 双版本（本地是 22.12）

## 7. 复现方式

```bash
# 隔离 registry
npx verdaccio@6 --config /tmp/verdaccio.yaml

# Core 切版本并发布到隔离 registry
git worktree add /tmp/core-rc origin/main
cd /tmp/core-rc && git checkout -b rc-lab
pnpm exec tsx scripts/release/version-rehearsal.ts --version 0.2.0-rc.0 --apply
pnpm exec tsx scripts/release/sync-native-loader.ts 0.2.0-rc.0
pnpm build
for d in packages/*/*/; do (cd "$d" && pnpm publish --no-git-checks --tag rc --registry http://127.0.0.1:4874 --provenance=false); done

# UI 对着隔离 registry 生成锁文件
git worktree add /tmp/ui-cand ca8cf2c8
cd /tmp/ui-cand && echo 'registry=http://127.0.0.1:4874/' > .npmrc
pnpm install --lockfile-only --no-frozen-lockfile
grep -c "127.0.0.1" pnpm-lock.yaml   # 必须是 0
```
