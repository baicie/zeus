# Phase 3D: Admin 路由级懒加载的验收与剩余空间

日期：2026-11-13
基线：`main` @ `7d1031e4`（PR #244 已合入路由懒加载）
前置：`docs/performance/phase-p10-admin-lazy-routes.md`、`docs/performance/phase-p10-baseline.*`

---

## 1. 本轮做了什么、没做什么

PR #244 已经把九条路由改成 `lazy: async () => ({ element: ... })`，`pages.tsx`
拆成 `pages/*.tsx`。本轮的任务是**验收它是否真的降低了首屏**，以及在它之后
还有没有值得做的拆分。

结论：

- 懒加载**确实成立**，并且是可复现、可判定的（§2）。
- 首屏还有约 4–5 KB gzip 的候选（zh-CN 语言包），但**本轮不做**，理由是
  收益与首屏语言闪烁的风险不成比例（§4）。
- 真正的大头不在主 chunk，在 Users 页的 WebC DataGrid（§3）。

## 2. 验收：登录页确实不下载任何路由 chunk

新增 `scripts/perf/measure-admin-chunks.ts`（`pnpm measure:admin-chunks`）。

它不靠"登录卡出现后等 300ms 再快照"这种时间窗口判定——那是原 baseline
harness 的做法，20 个样本里有 1 个因为快照时机多算了一条记录。这里直接在
**未认证**页面上读 `performance.getEntriesByType('resource')`：此时没有导航到
任何路由，出现 `pages/*.js` 就是真正的 eager 依赖。

MEASURED，HEAD `7d1031e4`，Chromium 156.0.8078.4，1440×900：

| 项                     | 结果                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| 登录页请求的路由 chunk | **0**（`lazyInvariant: PASS`）                                    |
| 脚本能识别的路由 chunk | 8 个（`audit/overview/reports/roles/settings/upload/user/users`） |
| 登录页入口 JS          | 284,747 raw / 86,972 gzip / 74,280 Brotli                         |
| 登录页 CSS             | 39,676 raw / 7,639 gzip / 6,802 Brotli                            |

「能识别 8 个」这行是必要的：如果路由 chunk 命名变了而脚本没跟上，判定会
退化成永远 PASS。脚本对认不出的 chunk 报 **UNPROVEN** 而不是 PASS。

### 与懒加载前的同机对照

同一 harness、同一台机器，`8f8f5256`（懒加载前，临时 worktree 构建）对
`7d1031e4`：

| 指标                      | 8f8f5256 | 7d1031e4 |       变化 |
| ------------------------- | -------: | -------: | ---------: |
| 登录入口 JS raw           |  340,510 |  284,747 | **−16.4%** |
| 登录入口 JS gzip(9)       |   97,293 |   86,972 | **−10.6%** |
| 登录入口 JS Brotli        |   82,069 |   74,280 |      −9.5% |
| 登录页 transfer（含 API） |  381,164 |  325,401 |     −14.6% |
| 登录后导航增量 transfer   |   48,897 |   76,749 |       +57% |

最后一行是分包的固有代价：九个页面从主 chunk 移到按需 chunk，登录页省下的
字节在导航时才付出。这是预期的交换，不是回归。

### 一处文档数字的修正

`phase-p10-admin-lazy-routes.md` 写"优化前 gzip 98,380 B，−11.6%"。实测该文件
gzip(level 9) 是 **97,293 B**，Vite 构建报告（gzip 默认级 6）是 97,459 B。
98,380 这个数复现不出来，来源不明。raw 的 −16.4% 完全可复现。正确的百分比是
**−10.6%**（gzip）与 **−9.5%**（Brotli）。

这次修正写在这里而不是改写原文档：原文档记录的是当时那次测量的原始输出，
把数字改掉会让它看起来像从未发生过。两处并存，以本文件为准。

## 3. 时间维度：没有可测出的收益，如实记录

同一 harness，5 样本丢弃首个后取中位数（MEASURED）：

| 指标                           | 8f8f5256 | 7d1031e4 |
| ------------------------------ | -------: | -------: |
| loginInteractiveMs             |       95 |      120 |
| dataGridInteractiveMs          |      355 |      498 |
| cold/slow4g loginInteractiveMs |    2,407 |    2,131 |

未限速场景下 285 KB 与 341 KB 在本机都是几十毫秒级，差异落在噪声里，方向上
甚至相反。**没有证据表明懒加载让交互变快**；证据只支持"首屏字节更少"。

限速场景有一个方向一致的改善（−11%），但单次对照不足以称为结论。

这一条必须写清楚，因为"首屏 JS −16.4%"很容易被读成"首屏快了 16.4%"，而实测
不支持后者。

## 4. 本轮不做的优化，及理由

### zh-CN 语言包懒加载 —— 决定不做

两个 catalog 都是静态导入：`en.ts` 11,863 B、`zh-CN.ts` 11,575 B。运行时
（`packages/core/i18n`）已经支持 `loadCatalog` + `preload`，技术上可行。

不做的原因：

1. **收益小。** 11.5 KB 源码压缩后大约 4–5 KB gzip，相对 86,972 B 的入口
   chunk 是 5% 量级。
2. **会引入首屏语言闪烁。** `app.tsx` 在模块加载时调
   `bootstrapLocale()` → `i18n.setLocale(locale)`。`setLocale` 在 catalog
   缺失时是**异步**的，`locale()` 会保持 `en` 直到加载完成。中文用户（浏览器
   语言是 zh-CN，或存了个人偏好）会在首屏看到英文，然后跳成中文。这正是
   任务禁止的"i18n 切换回退异常"/"登录鉴权闪烁"同类问题。
3. **同步加载才能避免闪烁**，而同步加载就等于不拆。

如果将来要做，正确做法不是在 `app.tsx` 里 await（那会让首屏多一次往返），
而是在 HTML 入口做 `modulepreload` 条件提示，或在构建期按 locale 生成两个
入口。两者都超出本轮范围。

### 更细的页面拆分 —— 决定不做

`users-*.js` 17,196 B raw / 4,963 gzip 是最大的路由 chunk，但它 71% 的体积
来自它拉入的 WebC entry（见下）。把页面再切细只会产生更多小 chunk，每个都
有自己的模块包装开销，而 `docs/performance/phase-p10-admin-lazy-routes.md`
已经记录过总量的 +18.2% 就是这么来的。

### 真正的下一块：DataGrid WebC entry

MEASURED，首次访问 Users 的增量：

| 文件                      |        raw |       gzip |     Brotli |
| ------------------------- | ---------: | ---------: | ---------: |
| `users-*.js`（页面本身）  |     17,196 |      4,963 |      4,263 |
| `zw-input.entry-*.js`     |      3,558 |      1,435 |      1,245 |
| `zw-data-grid.entry-*.js` | **41,912** | **13,206** | **11,987** |
| 合计                      |     62,666 |     19,604 |     17,495 |

DataGrid 的 entry 比页面本身大 2.4 倍，这是 Web Components 注册的固有成本
（每个自定义元素一个 entry）。要动它，得先回答"这些 entry 是否真的需要各自
独立成 chunk"——那是 WebC 打包器的设计问题，不是 Admin 的路由问题。**记录为
后续方向，本轮不动**，因为改它会影响所有 WebC 消费者，而不只是 Admin。

### 部署环境的压缩方式

生产（`admin.moonbyte.top:8443`，Caddy）对 `Accept-Encoding: br, gzip, zstd`
选 **zstd**；客户端只发 `br` 时 Caddy **不压缩**，返回 identity。因此：

- 用 Brotli 数字描述线上传输量是**错的**（线上走 zstd）。
- 本机 Admin server 完全不压缩，用它的 transferSize 描述线上会高估约 3.6 倍。

任何引用"首屏传输量"的地方都必须说明是哪个环境。这是 Caddy 配置，不在本轮
代码范围内，记录为观察。

## 5. 正确性验证

| 检查                                                              | 结果                           |
| ----------------------------------------------------------------- | ------------------------------ |
| `pnpm -F @zeus-js/example-admin check`                            | clean（需先 `pnpm build-dts`） |
| `pnpm check:admin`（Chromium/Firefox/WebKit，CI run 43246592042） | PASS ×3                        |
| DevTools 面板（同上）                                             | PASS ×3                        |
| `lazyInvariant`                                                   | PASS                           |
| 登录页无路由 chunk                                                | 0 个                           |

**本地复现注意：** 直接 `pnpm -F @zeus-js/example-admin check` 在未执行
`pnpm build-dts` 的工作区会报 5 个 `TS7006`（`shell.tsx` 里 `item`、`match`
等隐式 any）。原因不是代码：`packages/core/zeus/dist/*.d.ts` 不存在时 JSX
类型解析退化。CI 在 `check:admin` 之前先跑 `build-dts`，所以通过。这是环境
前置条件，不是缺陷，已在此记录以免下一个人误判为回归。

## 6. 未覆盖的场景

- **Firefox / WebKit 的字节与时间未单独测量。** 三个引擎都跑了功能验收，
  但 chunk 清单与 timing 只在 Chromium 上采。分包图与引擎无关，timing 有关。
- **热缓存下的路由切换**只测了同 context 的 in-page 导航（Users shell 71ms、
  DataGrid 首行 +2ms、返回 36ms），没有测跨刷新。
- **预取策略未启用。** 任务提到"对必要的常用页面使用经过验证的预取策略"，
  本轮没有加：在没测过真实用户导航分布之前，预取是猜。
