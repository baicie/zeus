# Phase P10-1: 可重复的前端性能基线

日期：2026-11-12
基线：`main` @ `8f8f5256`（Admin 懒加载改动之前）
生成器：`scripts/perf/measure-frontend-baseline.ts`（`pnpm measure:frontend-baseline`）

## 方法

- **每个场景 N 个样本，报中位数。** 第一个样本作为 warm-up 丢弃 ——
  它要付首次 JIT 编译与（Playground 首次编译时的）1.5 MB wasm 下载，
  本机实测第一个冷样本 9,042 ms 而后续为 315 / 277 ms。那个数字是真的，
  但它属于 `samples` 数组，不属于描述稳态的中位数。
- **冷 / 热分开。** cold 每次用全新 browser context（空 HTTP 缓存）；
  warm 在同一 context 内 reload，缓存生效。两者混在一起会产出一个
  既不描述首次访问、也不描述回访的数字。
- **限速用 CDP**：Slow 4G（1.6 Mbps / 150 ms RTT）与 Fast 3G（0.4× / 562.5 ms）。
- **transfer / encoded / decoded 分开记。** `transferSize` 是压缩后过线的字节，
  `decodedBodySize` 是解析器与 JS 引擎要处理的字节。只看一个数会掩盖
  "传输变小但解析变大"这类变化。
- **稳定性显式标注。** 该指标按 `(p90−p10)/median` 计算；超过 50% 标为 unstable，
  而不是把一个抖动很大的中位数当作精确值呈现。

## 这不是 CI 门禁

一台笔记本上测出的数字不是另一台机器的阈值。这个文件是**同机前后对比**用的
文档，配套 JSON 里保留每个样本，便于核对波动。

## playground

- commit: `8f8f52565eb9b83b0a9f5c8a3917e77d10b3a9ed`
- browser: chromium 156.0.8078.4, viewport 1440x900
- samples per scenario: 4 scenarios

| scenario         | metric             | median (ms) | stability |
| ---------------- | ------------------ | ----------: | --------- |
| cold/unthrottled | firstEditableMs    |         240 | stable    |
| cold/unthrottled | firstPreviewMs     |         461 | stable    |
| cold/unthrottled | firstOutputMs      |         521 | stable    |
| cold/unthrottled | domContentLoadedMs |          72 | stable    |
| cold/unthrottled | loadMs             |         144 | stable    |
| cold/unthrottled | editToPreviewMs    |        1361 | stable    |
| warm/unthrottled | firstEditableMs    |          89 | stable    |
| warm/unthrottled | firstPreviewMs     |         451 | stable    |
| warm/unthrottled | firstOutputMs      |         564 | stable    |
| warm/unthrottled | domContentLoadedMs |          67 | stable    |
| warm/unthrottled | loadMs             |         131 | stable    |
| warm/unthrottled | editToPreviewMs    |        1348 | stable    |
| cold/slow4g      | firstEditableMs    |        3052 | stable    |
| cold/slow4g      | firstPreviewMs     |        6241 | stable    |
| cold/slow4g      | firstOutputMs      |        6420 | stable    |
| cold/slow4g      | domContentLoadedMs |        1124 | stable    |
| cold/slow4g      | loadMs             |        1369 | stable    |
| cold/slow4g      | editToPreviewMs    |        7396 | stable    |
| cold/fast3g      | firstEditableMs    |        7134 | stable    |
| cold/fast3g      | firstPreviewMs     |       16233 | stable    |
| cold/fast3g      | firstOutputMs      |       16424 | stable    |
| cold/fast3g      | domContentLoadedMs |        3103 | stable    |
| cold/fast3g      | loadMs             |        3784 | stable    |
| cold/fast3g      | editToPreviewMs    |       17797 | stable    |

### Transfer vs decode (median of samples)

| scenario         | transfer KiB | encoded KiB | decoded KiB |
| ---------------- | -----------: | ----------: | ----------: |
| cold/unthrottled |       1008.6 |      1005.1 |      4877.8 |
| warm/unthrottled |          0.0 |      1005.1 |      4877.8 |
| cold/slow4g      |       1008.6 |      1005.1 |      4877.8 |
| cold/fast3g      |       1008.6 |      1005.1 |      4877.8 |

## admin

- commit: `8f8f52565eb9b83b0a9f5c8a3917e77d10b3a9ed`
- browser: chromium 156.0.8078.4, viewport 1440x900
- samples per scenario: 4 scenarios

| scenario         | metric                | median (ms) | stability |
| ---------------- | --------------------- | ----------: | --------- |
| cold/unthrottled | loginInteractiveMs    |         119 | stable    |
| cold/unthrottled | dashboardMs           |         350 | stable    |
| cold/unthrottled | usersPageMs           |         442 | stable    |
| cold/unthrottled | dataGridInteractiveMs |         447 | stable    |
| cold/unthrottled | navigateBackMs        |         512 | stable    |
| warm/unthrottled | loginInteractiveMs    |         115 | stable    |
| warm/unthrottled | dashboardMs           |         454 | stable    |
| warm/unthrottled | usersPageMs           |         578 | stable    |
| warm/unthrottled | dataGridInteractiveMs |         584 | stable    |
| warm/unthrottled | navigateBackMs        |         683 | stable    |
| cold/slow4g      | loginInteractiveMs    |        2165 | stable    |
| cold/slow4g      | dashboardMs           |        3094 | stable    |
| cold/slow4g      | usersPageMs           |        3435 | stable    |
| cold/slow4g      | dataGridInteractiveMs |        4227 | stable    |
| cold/slow4g      | navigateBackMs        |        4276 | stable    |
| cold/fast3g      | loginInteractiveMs    |        5970 | stable    |
| cold/fast3g      | dashboardMs           |        8205 | stable    |
| cold/fast3g      | usersPageMs           |        9056 | stable    |
| cold/fast3g      | dataGridInteractiveMs |       10348 | stable    |
| cold/fast3g      | navigateBackMs        |       10379 | stable    |

### Transfer vs decode (median of samples)

| scenario         | transfer KiB | encoded KiB | decoded KiB |
| ---------------- | -----------: | ----------: | ----------: |
| cold/unthrottled |        393.1 |       389.6 |       389.6 |
| warm/unthrottled |        329.5 |       327.8 |       327.8 |
| cold/slow4g      |        393.1 |       389.6 |       389.6 |
| cold/fast3g      |        393.1 |       389.6 |       389.6 |
