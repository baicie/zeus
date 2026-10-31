# 编译器增量缓存测量

日期：2026-10-31。命令：`pnpm bench:compiler-cache`。脚本在 Node `--expose-gc` 下直接测量
`createCompilerCache`，不把 native 编译时间混入缓存数据。

本次本机样本使用 5,000 个模块、10,000 次热命中，结果为：

| 指标                 |        结果 |
| -------------------- | ----------: |
| cold lookup + set    |    0.252 ms |
| warm lookup 平均     |    0.003 ms |
| changed lookup + set |    0.041 ms |
| 保留条目数           |       5,001 |
| heap 增量            | 1,673,232 B |
| 每条目 heap 增量     |   334.646 B |

缓存计数器得到 10,000 次 hit、2 次 miss、0 次 invalidation；每个模块和 target 只保留最新条目。
这些数字用于记录测量方法和数量级，不构成跨机器性能阈值；CI 运行同一脚本以验证缓存边界和报告生成不回归。
