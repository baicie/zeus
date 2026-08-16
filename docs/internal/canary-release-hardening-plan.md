# Canary 发布加固实施计划

## 背景

2026-08-12，旧功能分支的延迟 Canary workflow 在较新的 `main` 发布完成后才结束，
把所有 fixed packages 的共享 npm `canary` dist-tag 从 `b919e73` 回退到了
`aaffcfa2`。根因是发布 workflow 同时允许多个分支自动运行，并按 `github.ref`
划分 concurrency group，但所有运行写入同一个 npm dist-tag。

本计划先恢复发布通道的单写者约束，再发布首个包含纯 Rust/Oxc 编译器的 beta。

## 架构决策

- `canary` 是 `main` 的唯一共享预发布通道，只允许 `main` 自动或手动发布。
- Canary、正式发布与 native `latest` 修复共用 `npm-release` concurrency group，且
  `cancel-in-progress: false`；运行排队串行完成，不在 publish 中途取消旧运行。
- 每次真实 publish 与正常的共享 dist-tag 提升写入前后，必须确认 workflow SHA 仍等于
  远端 `main` HEAD；提升失败后的快照回滚是例外，必须能够恢复本次运行已改动的标签。
- 25 个包先发布到本次运行唯一的 staging tag；全部可见且 provenance 校验通过后才
  提升到 `canary`，提升失败按快照回滚。
- 共享 `canary` 再验证成功后 best-effort 清理 staging tag；清理失败保留唯一审计标签，
  但不能把已验证的 Canary 错误标记为发布失败并诱发无意义重发。
- 发布后同时验证版本可见性、fixed group dist-tag 一致性和 Rust compiler 的真实安装/加载。
- feature/fix/refactor 分支继续运行 CI 与 native matrix；需要分支预发布时另行设计分支专属 tag。
- native 包首次发布可能被 npm 自动赋予 `latest`；预发布验证必须拒绝 native `latest`
  指向 Canary。当前历史污染执行一次受控清理，日常 workflow 不自动删除标签，避免与正式
  发布并发时发生错误删除。
- 一次性清理由只允许 `main` 手动触发的 `Repair Native Latest` workflow 执行，要求输入
  精确污染版本与动态确认串，并与所有发布共享 `npm-release` 锁。

## 实施任务

### Task 1：收敛 Canary 发布所有权

验收标准：

- `release-canary.yml` 的 push 触发只包含 `main`。
- `workflow_dispatch` 仅能在 `main` ref 上进入发布 job。
- concurrency group 为全局固定的 `npm-release`，且 `cancel-in-progress: false`。
- release config 的 `includeBranches` 只允许 `main`。

验证：`pnpm test-unit -- scripts/release/__tests__/release-workflow.spec.ts scripts/release/__tests__/release-config.spec.ts`

### Task 2：增加 main HEAD 与 npm dist-tag 守卫

验收标准：

- 发布前验证 event、branch、SHA 与远端 `main` HEAD。
- Canary 发布先保证所有 fixed packages 的 staging tag 等于本次版本，再提升并保证
  `canary` tag 等于本次版本。
- 正式预发布后对应 prerelease tag 等于本次版本。
- provenance 必须通过 Sigstore 签名验证，并匹配 npm tarball integrity、
  `baicie/zeus`、发布 workflow、git ref 与精确 commit SHA。
- native 包的 `latest` 不得指向 Canary；现有错误标签在发布前执行一次受控清理。

验证：相关单元测试通过，并可对 npm 公共 registry 执行只读校验。

### Task 3：增加 Rust compiler 真实安装 smoke

验收标准：

- native matrix 在每个平台从本地产出的 tarball 安装公共 `@zeus-js/compiler`。
- ESM 与 CJS 均能执行 DOM 和 SSR transform。
- 正式/Canary 发布后，Linux glibc 从 npm registry 的空目录安装目标版本并重复 smoke。
- CI 覆盖 Node 22 最低支持线与 Node 24。

验证：本地 tarball smoke 和 registry smoke 脚本均通过。

### Task 4：合并并恢复 Canary

验收标准：

- 修复 PR 的 CI、native matrix 与评审全部通过并合并到 `main`。
- `main` 的 Canary workflow 成功。
- 25 个 fixed packages 的 `canary` tag 都指向该次 `main` SHA 对应版本。
- Node 22/24 registry smoke 通过后，`zeus-ui` 收到 dispatch 且兼容性检查通过。

### Task 5：发布 `v0.1.1-beta.1`

验收标准：

- Rust 迁移 changeset/changelog 完整。
- release dry-run 和完整 precheck 通过。
- tag workflow 发布并验证 25 个 fixed packages。
- `beta` dist-tag 一致，native compiler ESM/CJS 安装 smoke 与 provenance 验证通过。
- GitHub Release 只在 Node 22/24 registry smoke 全部通过后创建。
- native `latest` 不指向 Canary。

## 回滚

- 发布链代码问题：revert 对应 PR，`main` 仍是 Canary 唯一发布者。
- Canary 版本异常：将所有 fixed packages 的 `canary` dist-tag 重设到最后一个已验证版本。
- beta 异常：把 `beta` dist-tag 重设到 `0.1.1-beta.0`；已发布的不可变版本保留供审计。

## 后续

发布闭环完成后，新开 `refactor/rust-ir-contract`，以 Rust schema 收敛唯一 Zeus IR
契约；Oxc 升级保持为独立 PR。
