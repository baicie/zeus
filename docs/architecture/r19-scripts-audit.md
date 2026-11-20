# R19 Phase 3 — 根目录脚本入口审计

基线 `cc9a8254`。`package.json` 共 **166** 个 scripts。

**结论先行：本次不删除、不改名任何脚本。** 下面的审计说明为什么
"看起来没人用"不等于"可以删"。

---

## 1. 重复别名：没有

按**命令体完全相同**统计：**0 组**。

按**指向同一脚本文件**统计，有 11 组，但都是有意义的参数变体：

| 脚本文件                                 | 入口                                                        | 差异                                                         |
| ---------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| `bundler/build.ts`                       | `build` / `dev`                                             | `--watch`                                                    |
| `check-native-packages.ts`               | `check:native-packages` / `check:native-binaries`           | `--require-binaries`                                         |
| `bench/component-host.ts`                | `bench:component-host` + 4 个变体                           | `--ci` / `--size-only` / `--compile-only` / `--runtime-only` |
| `size/size-report.ts`                    | `size` / `size:ci`                                          | `--ci`                                                       |
| `size/build-size-report-cli.ts`          | `size:report` / `size:report:ci` / `size:baseline`          | `--ci` / `--write-baseline`                                  |
| `playground/generate-api-completions.ts` | `check:playground-api`（含前置构建）/ `playground:api`      | `--check` + 构建链                                           |
| `playground/check-playground.ts`         | `playground:check` / `playground:update`                    | `--update`                                                   |
| `release/release.ts`                     | `release` / `release:publishOnly` / `release:dry`           | `--publishOnly` / `--dry --skipGit`                          |
| `promote-canary.ts`                      | `release:promote:canary` / `release:cleanup:canary-staging` | `--cleanup`                                                  |
| `check-sbom.ts`                          | `check:sbom` / `check:sbom:write`                           | `--check`                                                    |
| `deployment-stage1.ts`                   | `deploy:stage1`                                             | 单入口                                                       |

**没有一组是"两个名字做同一件事"。**

---

## 2. 失效入口：没有

用脚本内所有 `tsx <file>` / `node <file>` 引用逐个 `fs.existsSync`：

```
script 指向不存在的文件: (none)
```

**166 个脚本，零个指向已退休的路径。** R16.0 的目录重构没有在
`package.json` 里留下悬空入口。

---

## 3. 从未被仓库内任何文件提及的脚本：22 个

扫描全部 `.ts/.tsx/.js/.mjs/.md/.yml/.yaml/.json`（排除 `node_modules`、
`target`、`dist`）后，有 22 个脚本名从未出现：

| 分组           | 脚本                                                                                                                                                                                                                                                                                                  | 判断                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 开发者手动入口 | `lint-fix`、`test-coverage`、`docs:dev`、`docs:preview`                                                                                                                                                                                                                                               | **保留**。它们的消费者是人，不是文件 |
| 示例入口       | `example:headless`、`example:context`、`example:todo`、`example:headless-demo`、`example:react-wrapper`、`example:vue-wrapper`、`example:project-board`、`example:light-dom-slots`、`example:use-headless-cli`、`example:use-headless-vue`、`example:registry-react`、`example:registry-vue`（12 个） | **保留**。文档里的示例流程靠它们     |
| 发布/演练      | `standalone:release`、`release:provenance`、`drill:rc-recovery`、`check:publish-manifest`、`create-zeus:build`                                                                                                                                                                                        | **保留**，见下                       |
| 部署           | `deploy:stage2`                                                                                                                                                                                                                                                                                       | **保留**，但见 4.1 的旁路问题        |

### 为什么发布类脚本不能删

`standalone:release` 和 `drill:rc-recovery` 的脚本文件**没有被任何非测试
文件 import**，脚本名也没被任何 workflow 调用。按"零引用"的标准它们
符合删除条件。

**但它们不删，理由有三条：**

1. **这是发布链路的应急入口。** `drill:rc-recovery` 是 RC 恢复演练，
   只在发布事故时用。零引用是它的正常状态，不是废弃的证据。
2. **删除无法验证。** 本仓库没有真实发布环境可用来证明"这次删了不影响"。
   我不愿意用"没搜到引用"去赌一条只在事故时使用的路径。
3. **R19 禁止删除 release-pairing / release-policy。** 这两个脚本正是
   操作它们的工具。删工具、留数据，会让数据变成只能手改的孤岛。

`release:provenance` 与 `check:publish-manifest` 同理：前者写 provenance，
后者校验 manifest，都属于发布审计面。

---

## 4. 发现的两个真实问题

### 4.1 `deploy:stage2` 存在旁路

```
package.json:  deploy:stage2  =  tsx scripts/release/deployment-stage2.ts
workflow:      .github/workflows/host-deployment-stage2.yml:191
               pnpm exec tsx scripts/release/deployment-stage2.ts $ARGS
```

CI **不调用 `deploy:stage2`**，而是直接 `pnpm exec tsx <文件>`。
后果：

- 如果有人改了 `deploy:stage2` 的参数或前置步骤，CI 不会跟着变；
- 反之 CI 里传的 `$ARGS` 也不会被脚本入口反映。

这不是"重复别名"，是**同一件事有两套调用方式，其中一套不受另一套约束**。
本次**只记录、不修**——改 workflow 需要理解 stage2 的部署语义，
不属于目录治理范围。

### 4.2 `release:publishOnly` 的命名与 `release` 不一致

`release` / `release:dry` / `release:publishOnly` 三个入口里，
前两个用 kebab-case（`dry`），第三个用 camelCase（`publishOnly`）。

这是命名不一致，不是缺陷。**不改名**：`release:publishOnly` 可能被
发布手册或维护者肌肉记忆依赖，而改名收益只是观感。

---

## 5. 危险命令面的确认

含 `publish` / `dist-tag` / `--force` / `clean` 字样的脚本共 9 个：

```
check:publish-manifest      release:verify:published    ci-publish
release:publishOnly         release:verify:dist-tags    standalone:publish
release:cleanup:canary-staging
release:cleanup:native-latest
```

**没有一个是组合命令**（无 `&&`、无管道串联多个发布步骤）。
每个脚本体内都是单个 `tsx` 调用，由 TypeScript 代码决定行为。
这是好设计：危险动作的可见性来自脚本内容，而不是 shell 拼接。

---

## 6. 分组改善发现性（建议，本次不实施）

当前 166 个脚本按前缀分布（实测计数）：

| 前缀                                                                                      | 数量    |
| ----------------------------------------------------------------------------------------- | ------- |
| `check:*`                                                                                 | 64      |
| `release:*`                                                                               | 21      |
| 无前缀（`build`、`test`、`lint`、`dev` 等）                                               | 18      |
| `example:*`                                                                               | 16      |
| `bench:*`                                                                                 | 9       |
| `size:*`                                                                                  | 4       |
| `playground:*`                                                                            | 4       |
| `test:*` / `docs:*` / `measure:*`                                                         | 各 3    |
| `native:*` / `build:*` / `examples:*` / `standalone:*` / `api:*` / `admin:*` / `deploy:*` | 各 2    |
| `debug:*` / `new:*` / `accept:*` / `audit:*` / `repair:*` / `create-zeus:*` / `drill:*`   | 各 1    |
| **合计**                                                                                  | **166** |

`check:*` 占全部脚本的 38.6%（64/166）——这是门禁密度的直接体现。

### 需要澄清的一点：`pnpm check` 不是聚合入口

```json
"check": "tsc --incremental --noEmit"
```

**`pnpm check` 只做类型检查**，它**不**串联任何 `check:*` 脚本。
64 个门禁需要一个一个调用，或由 CI workflow 编排。

`AGENTS.md` §14.2 第 7 条写的是"CI 已在 `pnpm check` 后执行
`check:structure`"。这是准确的：`ci.yml` 先跑 `pnpm check`（类型检查），
再单独一个 step 跑 `pnpm check:structure`。

容易被误读的是"在 `pnpm check` 后"看起来像因果关系，实际是**时间顺序**。
本地复现时两条命令都要跑，不能只跑 `pnpm check`。

**不建议**为了"看起来整齐"给所有命令加一层转发包装
（例如 `pnpm cmd:check:xxx`）。那会增加一层间接，且让
`pnpm run` 的自动补全失去意义。

**建议**（未实施，属文档工作）：在 `CONTRIBUTING.md` 或
`docs/guide/` 下补一张"常用脚本速查表"，按任务而不是按前缀组织
（"我要跑测试"、"我要看体积"、"我要演练发布"）。

---

## 7. 本次的净改动

**零。** 本文只记录审计结论。

不删脚本的三条理由见第 3 节。若后续要删，需要先证明该脚本没有
仓库外消费者（维护者本机 alias、发布手册、其他 checkout 的引用），
这超出本仓库可验证的范围。
