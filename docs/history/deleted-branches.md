# 已删除分支的 SHA 清单

本文件记录被删除的分支及其删除前指向的提交。存在的理由只有一个：
squash 合并会让 `git branch --merged` 与 `git cherry` 把已合入的分支误报为
未合入，删完之后无法再从图里复原「它当时在哪」。要判断一个分支的内容是否
真的进了主线，用 blob 判据（该分支版本的 blob 是否曾出现在主线历史里），
不要用提交号。

## 2026-11-26 · R19 收尾

清理范围：R19 期间合并入 main 的 9 个 zeus 分支、5 个 zeus-ui 分支。
判据：分支相对 merge-base 的每个文件，其分支版本 blob 都已在 main 历史中。

### zeus

| 分支                                            | 删除前提交                                 | 日期       | 内容已全部进 main |
| ----------------------------------------------- | ------------------------------------------ | ---------- | ----------------- |
| `chore/drop-vendored-dialog`                    | `02146dbd88b13b3d314859390173bce45b17ca6a` | 2026-11-26 | 是                |
| `chore/git-safety-guard`                        | `1347e9d5ed51fa026e3266fe254a6a1f0c464ef4` | 2026-11-25 | 是                |
| `chore/remove-legacy-admin`                     | `205f973fc5776fbaae241cdf2e1a23dc4fefd69d` | 2026-11-26 | 是                |
| `feat/publish-devtools-consumer`                | `bd08a062432820aa46837ff417a86a286bb51c9c` | 2026-11-25 | 是                |
| `fix/main-formatting`                           | `7817563b0ab690978e9fb79c4d62c9cf897c3333` | 2026-11-25 | 是                |
| `fix/package-table-generator`                   | `064dec435a36ce72e86b16424abe20a429b1d0fe` | 2026-11-25 | 是                |
| `fix/release-tag-and-cjs-types`                 | `f16efcf98843b2dbf68204d5482873972feac44c` | 2026-11-25 | 是                |
| `fix/vite-plugin-compiler-contract`             | `616ebf9592ec9077d458d8ebc4091ec08b7242a1` | 2026-11-25 | 是                |
| `release/0.0.6`                                 | `df977ac7d1e1aa73029745829aec795db1896f27` | 2026-11-25 | 是                |
| `refs/remotes/origin/release/vite-plugin-0.0.6` | `6041be747cdec4576103eb887afc3c1ca519875e` | 2026-11-25 | 是                |

### zeus-ui

| 分支                                  | 删除前提交                                 | 日期       | 内容已全部进 main |
| ------------------------------------- | ------------------------------------------ | ---------- | ----------------- |
| `chore/benchmarks-under-scripts`      | `2cf2d24e577718b5606d3ec6083c04b0b0d3720c` | 2026-11-26 | 是                |
| `feat/publish-order-gate`             | `692fe9951d81d59a92075ff22a1e91496d252cd2` | 2026-11-24 | 是                |
| `feat/registry-verification-policy`   | `7d824a47b40bd328550a19df8ac813180fcad5f4` | 2026-11-24 | 是                |
| `fix/dry-run-isolation`               | `4bdf72709fe0fb0f29e060d708d4b1135fee7e73` | 2026-11-24 | 是                |
| `fix/historical-release-verification` | `4e7e429f3f178942580dd6d268b311c0691240e4` | 2026-11-24 | 是                |

### 保留未删

| 分支                                | 提交                                       | 原因                                                                                                                     |
| ----------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| zeus `chore/remove-legacy-admin-ci` | `92c01cdd2a48ea18d34376b50c5caf30d68e67fd` | PR #412 只合了前一段；本地多出 `92c01cdd`（TCR 100-tag 限额）未进 main，main 上仍保留 `sha-*` 镜像标签，仓库会被再次填满 |
| zeus `fix/standalone-release-list`  | `e78f5e387e0f812b99cff9193b1c47bf489592c2` | PR #410 已关闭未合并，两个文件的内容都不在 main                                                                          |
