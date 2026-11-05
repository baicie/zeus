# 编译器增量缓存测量

日期：首次测量 2026-10-31，复测 2026-11-01（下表为复测数据）。命令：`pnpm bench:compiler-cache`。脚本在 Node `--expose-gc` 下直接测量
`createCompilerCache`，不把 native 编译时间混入缓存数据。

本次本机样本使用 5,000 个模块、10,000 次热命中，结果为：

| 指标                 |        结果 |
| -------------------- | ----------: |
| cold lookup + set    |    0.320 ms |
| warm lookup 平均     |    0.003 ms |
| changed lookup + set |    0.042 ms |
| 保留条目数           |       5,001 |
| heap 增量            | 3,950,024 B |
| 每条目 heap 增量     |   790.005 B |
| 每条目结果 JSON 体积 |       423 B |

缓存计数器得到 10,000 次 hit、2 次 miss、0 次 invalidation；每个模块和 target 只保留最新条目。

每个条目持有独立的结果对象：`code`、一个带 `sourcesContent` 的 Source Map v3 与空的
`diagnostics`，与 `transformModule` 的真实返回形状一致。早先的脚本让 5,000 个条目共享同一个
极小的 value，测出来的 334.6 B/条目只反映 `Map` 本身的记账开销，不能代表热缓存实际占用的内存。

编译器会把收到的 Source Map 原地规范化（补 `sourcesContent`、改写 `sources`、追加
`x_google_ignoreList`），所以插件在返回给 Vite 之前复制 map 的可变字段；缓存中保存的原始结果
不会被下游改动污染。

这些数字用于记录测量方法和数量级，不构成跨机器性能阈值；CI 运行同一脚本以验证缓存边界和报告
生成不回归。
