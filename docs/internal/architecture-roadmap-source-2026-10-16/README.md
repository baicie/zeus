# 原始路线图来源保全

[01-TASKS.md.txt](./01-TASKS.md.txt) 是原始 `01-TASKS.md` 的完整原文，含 75 项任务；保留 `.txt` 扩展名以避免 Markdown 格式化改写字节。

SHA-256：`bac3e908363a46183cc086c0ee71499197af1287462b464139838ce4c86342cd`，与最初登记的原始文件哈希相同。2026-10-25 从既有任务的归档工具输出恢复；原 Downloads 目录当前不存在。

[02-DESIGN.partial.md.txt](./02-DESIGN.partial.md.txt) 只包含归档中实际读取过的前 260 行（13,734 B，SHA-256 `c1b2319a9f023340263e1434acdbf04853afccb5cceadd789e1eabe48ffe6f26`）。它不是完整设计原文，不能声称其哈希等于原文件。

2026-10-27 取证结论（详见 `temp/design-recovery/search-report.json`）：原文件真实路径为 `/Users/liuzhiwei/Downloads/zeus-architecture-roadmap-2026-10-16/02-DESIGN.md`，**59,843 字节，mtime 2026-10-16 16:08**；该 Downloads 目录已被删除。唯一读过该文件的会话只执行过 `sed -n '1,220p'` 与 `sed -n '1,260p'`，从未读取第 261 行之后，因此只能保留字节精确前缀。全机检索（家目录按 59,843 字节指纹、Spotlight、163 个明文会话 + 251 个 zstd 压缩会话、`thread_history` sqlite 全库、attachments、`~/.dsh`、VS Code 本地历史、git 全历史、APFS 本地快照）均未找到完整副本，缺失区间为第 261 行至文末（46,109 B，约 870 行）。

登记哈希 `feebc1df25d41442f5bb9a0bd54c60ed37f76d4ece5cea9a7483e30205a31e33` 只对应那份 59,843 字节的原文，因此「完整设计终审」在原文重新提供前不能宣称通过。恢复路径：用户从原始来源重新提供该文件或整个设计包目录；或从当时用于编辑它的 Cursor 账号侧工作区历史/备份取回。`01-TASKS.md` 哈希一致、内容完整，可独立用于逐项任务审计。

当前执行状态与验收见[任务台账](../architecture-roadmap-2026-10.md)及[完成性审计](../roadmap-completion-audit-2026-10-19.md)。原始文件属于设计提案，用户后续明确决定和仓库 AGENTS.md 优先；保全原文不等于重新引入历史兼容窗口或已放弃的 npm 标签清理。
