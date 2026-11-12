# Zeus 构建产物体积与加载性能审计

审计对象：`baicie/zeus` main `11a7bbfc65bae848b84a68ce8172dea786f8adb0`
（2026-11-12 16:21:59 +0800）
测量环境：macOS arm64，Node 24.16.0，pnpm 10.33.4，Vite 8.3.4 / Rolldown 1.1.2，
Chromium（Playwright `channel: chromium`）headless 1440×900。
所有数字均为本机实测。无法测量的项目明确标注 `NOT_RUN`，没有估算值，也没有把零当作结果。

标注约定：

- **MEASURED** — 本次审计实测得到。
- **ESTIMATED** — 由实测值推算，推算方式写在旁边。
- **NOT_RUN** — 未执行，原因写在旁边。

---

## 0. 结论速览

| 项              | 结论                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 框架真实负担    | Global Bundle **严重高估**。典型 DOM 应用只付 gzip 13.30 KB，是 `zeus.global.prod.js` 21.9 KB 的 61%；最小 Signal 应用只付 6.11 KB。                    |
| Playground 首屏 | `main` chunk 从 66,983 B 膨胀到 586,516 B（**+775%**）。根因是 `highlight.ts` 把 CodeMirror 解析器拉进首屏。**已修复，main 降至 138,132 B（−76.5%）**。 |
| 重复代码        | 已确证：`@babel/standalone`（2.1 MB）与 `@babel/parser`（287 KB）对同一批源码做重复解析。                                                               |
| 误命名          | 已确证：252 KB 的 `runtime-dom.esm-bundler-*.js` 实为 React 19 + Vue 3，不是 Zeus runtime。**已修复命名**。                                             |
| Docker 门禁     | 已复现并修复：门禁读的字段根本不存在，**每次都算出 0.0 MB 并放行**。修复后真实值 **76.7 MB**。                                                          |
| 体积预算        | 此前只有 5 个硬编码目标。**已新增** 182 个产物的结构化报告与回归门禁。                                                                                  |
| Admin           | 340.5 KB / gzip 98.4 KB 单 chunk，九个页面无路由级拆分。`pages.tsx` 单文件 50.2 KB 全量进首屏。                                                         |

---

## 1. 框架包产物体积

### 1.1 全部公共包 dist 汇总（MEASURED）

27 个公共包、148 个 dist 文件。按 raw 排序，取前 15：

| 包                              | raw KiB | gzip KiB | Brotli KiB | 文件数 |
| ------------------------------- | ------: | -------: | ---------: | -----: |
| `@zeus-js/runtime-dom`          |  1006.5 |    248.9 |      212.9 |      7 |
| `@zeus-js/component-analyzer`   |   530.4 |    109.3 |       93.5 |      7 |
| `@zeus-js/bundler-plugin`       |   517.3 |    133.7 |      119.5 |     15 |
| `@zeus-js/zeus`                 |   485.9 |    128.5 |      111.6 |     15 |
| `@zeus-js/signal`               |   391.6 |    101.0 |       88.6 |     15 |
| `@zeus-js/router`               |   386.8 |    103.3 |       89.6 |      5 |
| `@zeus-js/playground-engine`    |   242.4 |     65.1 |       55.9 |      7 |
| `@zeus-js/component-dts`        |   166.6 |     34.0 |       30.3 |      7 |
| `@zeus-js/output-wc`            |   118.9 |     29.6 |       26.1 |      7 |
| `@zeus-js/runtime-ssr`          |   115.3 |     31.8 |       27.5 |      3 |
| `@zeus-ui/registry`             |    77.1 |     12.5 |       10.8 |      3 |
| `@zeus-js/output-react-wrapper` |    68.4 |     16.8 |       14.9 |      3 |
| `@zeus-js/web-c`                |    66.3 |     19.6 |       17.0 |     15 |
| `@zeus-js/i18n`                 |    64.3 |     20.4 |       17.4 |      3 |
| `@zeus-js/output-vue-wrapper`   |    63.3 |     16.2 |       14.4 |      3 |

单个包的 raw 总量包含多种格式（dev/prod、global/browser/bundler/cjs、dts），
不代表任何单一消费者的下载量。逐格式明细在下一节。

### 1.2 核心包的逐格式产物（MEASURED）

只有这些是消费者真正可能下载的文件：

| 产物                                        | raw KiB | gzip KiB | Brotli KiB | 用途                         |
| ------------------------------------------- | ------: | -------: | ---------: | ---------------------------- |
| `runtime-dom.global.prod.js`                |   78.30 |    25.48 |      22.95 | CDN `<script>`，完整 runtime |
| `runtime-dom.esm-browser.prod.js`           |   78.35 |    25.48 |      22.90 | 浏览器 ESM，完整 runtime     |
| `runtime-dom.esm-bundler.js`                |  149.52 |    35.34 |      29.66 | 打包器入口（dev 分支保留）   |
| `zeus.global.prod.js`                       |   65.81 |    21.38 |      19.36 | CDN `<script>`               |
| `zeus.esm-browser.prod.js`                  |   65.82 |    21.37 |      19.36 | 浏览器 ESM                   |
| `zeus.esm-bundler.js`                       |    0.82 |     0.34 |       0.29 | 打包器入口（转发）           |
| `signal.global.prod.js`                     |   17.29 |     6.21 |       5.71 | 响应式核心                   |
| `signal.esm-browser.prod.js`                |   17.23 |     6.17 |       5.68 | 响应式核心                   |
| `signal.internal.js`（经 runtime-dom 内联） |   64.85 |    15.79 |      13.72 | 内部引擎                     |

与已知线索的对照：`runtime-dom` 实测 80.2 KB raw / 26.2 KB gzip（`pnpm build` 报告值），
`zeus` 实测 67.4 KB raw / 21.9 KB gzip —— 线索中的数字在当前 HEAD **仍然成立**。

### 1.3 npm packed 与解包体积（MEASURED）

34 个 tarball，合计 **6.21 MB**。其中 8 个 native 包占 **5.20 MB**：

| 包                                          | tarball B |    解包 B | 文件数 |
| ------------------------------------------- | --------: | --------: | -----: |
| `@zeus-js/compiler-native-darwin-arm64`     |   857,989 | 1,912,668 |      6 |
| `@zeus-js/compiler-native-linux-x64-musl`   |   822,437 | 1,900,693 |      6 |
| `@zeus-js/compiler-native-linux-x64-gnu`    |   811,152 | 1,877,739 |      6 |
| `@zeus-js/compiler-native-linux-arm64-gnu`  |   773,003 | 1,710,443 |      6 |
| `@zeus-js/compiler-native-darwin-x64`       |   760,119 | 1,683,900 |      6 |
| `@zeus-js/compiler-native-win32-x64-msvc`   |   732,476 | 1,761,885 |      6 |
| `@zeus-js/compiler-native-win32-arm64-msvc` |   695,726 | 1,605,229 |      6 |
| `@zeus-js/runtime-dom`                      |   254,394 | 1,034,622 |     10 |
| `@zeus-js/zeus`                             |   132,362 |   511,320 |     23 |
| `@zeus-js/bundler-plugin`                   |   122,414 |   535,791 |     21 |
| `@zeus-js/signal`                           |   100,512 |   406,411 |     20 |
| `@zeus-js/router`                           |    99,205 |   399,852 |      8 |

**判定**：native 包是 npm 侧最大的单笔负担，但它们由平台条件安装，
一个消费者只会装 1 个（约 700–860 KB tarball）。这是可接受的。

### 1.4 真实消费者的 tree-shaking 负担（MEASURED）

这是本节最重要的数据。用真实 Vite 生产构建测量三个场景，
入口为真实 JSX 组件，`runtime-dom` / `zeus` 走 `esm-bundler` 入口：

| 场景                                                  | raw KiB | gzip KiB | Brotli KiB | 占 Global Bundle gzip |
| ----------------------------------------------------- | ------: | -------: | ---------: | --------------------: |
| 最小 Signal 应用（1 signal + 1 effect）               |   16.07 |     6.11 |       5.57 |                 23.3% |
| 典型 DOM 应用（Show/For/事件/绑定）                   |   38.06 |    13.30 |      12.03 |                 50.8% |
| 完整 Runtime（WC host/Slot/Transition/ErrorBoundary） |   56.10 |    18.97 |      17.09 |                 72.5% |

**结论：不要用 Global Bundle 衡量消费者成本。**
典型 DOM 应用实际只付 13.30 KB gzip，不是 26.2 KB。差额是
从未被调用的 WebC host、hydration、Transition、ErrorBoundary 与
自动 hydration 观测代码，打包器正确剔除了它们。

**不可优化部分**：`zeus` 与 `runtime-dom` 的 `esm-browser`/`global` 入口
是全量导出面，按契约必须包含全部能力，其体积不能靠 tree-shaking 降低。

### 1.5 WASM 与 Native（MEASURED / NOT_RUN）

| 产物                                           |     raw B |  gzip B | Brotli B |
| ---------------------------------------------- | --------: | ------: | -------: |
| `zeus-compiler.wasm`（本机 rustc 1.95.0 重建） | 1,563,550 | 477,696 |  343,214 |
| 仓库中提交的 `zeus-compiler.wasm`              | 1,545,997 | 468,367 |  339,125 |

七个 native 平台的 `.node`：

| 平台             |     raw B |  gzip B | Brotli B |
| ---------------- | --------: | ------: | -------: |
| darwin-arm64     | 1,911,056 | 825,163 |  619,837 |
| linux-x64-musl   | 1,899,040 | 802,587 |  637,362 |
| linux-x64-gnu    | 1,876,088 | 791,173 |  627,928 |
| win32-x64-msvc   | 1,760,256 | 711,544 |  556,951 |
| linux-arm64-gnu  | 1,708,776 | 745,024 |  564,395 |
| darwin-x64       | 1,682,304 | 745,486 |  591,781 |
| win32-arm64-msvc | 1,603,584 | 669,617 |  505,393 |

Rust release profile（`Cargo.toml`）当前为
`codegen-units = 1`、`lto = "thin"`、`opt-level = 3`、`strip = "symbols"`。
符号已剥离，LTO 已开启。

**wasm-opt / twiggy 测量：NOT_RUN。**
本机未安装 `binaryen`（`wasm-opt`、`wasm-objdump`）与 `twiggy`，
本轮没有把它们作为依赖引入，因此**不能**断言 wasm 还有多少可压缩空间。
任何"wasm-opt 可省 X%"的说法在没有测量前都不成立。

可验证的观察（MEASURED）：wasm 的 Brotli 压缩比为 21.9%（343,214 / 1,563,550），
说明体积主体是代码而非数据表；若换 `opt-level = "s"` 或 `lto = "fat"`，
**必须**用 `check:compiler-wasm`（wasm 与 native 逐字节结果一致性）
与 `bench:compiler-optimization` 双重验证后才能采纳，本轮未做。

---

## 2. Playground 依赖归因

### 2.1 chunk 清单与归属（MEASURED，基于 sourcemap 逐字节归因）

| chunk                                 |     raw B |  gzip B | 归属                                                                                                                                                                       | 首屏？          |
| ------------------------------------- | --------: | ------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `babel-BNS_LnEj.js`                   | 2,207,205 | 563,964 | `@babel/standalone@8.1.1` 100%                                                                                                                                             | 首次编译时      |
| `playground-engine.esm-bundler-*.js`  |   455,150 | 119,516 | `@babel/parser` 286.7 KB + `@babel/types` 70.1 KB + engine 36.0 KB + component-analyzer 27.4 KB                                                                            | 是              |
| `dist-s2YT2TF6.js`（优化后）          |   446,750 | 150,910 | CodeMirror 共享依赖                                                                                                                                                        | 首次编辑/Output |
| `runtime-dom.esm-bundler-Cyicwoay.js` |   252,313 |  83,670 | **React 19.2.7 + ReactDOM + Vue 3.5.44**（误命名）                                                                                                                         | sandbox/host    |
| `main-*.js`（优化前）                 |   586,516 | 190,300 | CodeMirror view 189.3 KB + lezer/javascript 75.9 KB + state 45.8 KB + autocomplete 34.1 KB + lezer/lr 26.2 KB + language 24.3 KB + lezer/common 20.4 KB + ui.tsx 29.8 KB … | **是**          |
| `main-*.js`（优化后）                 |   138,132 |  38,930 | 同上减去 CodeMirror 解析器                                                                                                                                                 | 是              |
| `sandbox-*.js`                        |   108,156 |  34,320 | `@remix-run/router` 47.2 KB + Zeus router 10.9 KB + query 6.3 KB + `@tanstack/query-core` 33 KB                                                                            | sandbox         |
| `code-editor-impl-*.js`               |    92,155 |  34,650 | `@codemirror/commands` 22.9 KB + search 19.5 KB + lezer/css 16.7 KB + lint 10.8 KB                                                                                         | 首次编辑        |
| `runtime-dom.esm-bundler-CY9v_j9-.js` |    84,074 |  28,200 | **真正的 Zeus runtime**（runtime-dom 60.5 KB + signal/internal 20.3 KB）                                                                                                   | 是              |
| `zeus-compiler-*.wasm`                | 1,545,997 | 468,367 | Rust 编译器                                                                                                                                                                | 首次编译        |
| `browser-*.js`                        |     8,769 |   4,430 | `fflate`（分享链接压缩）                                                                                                                                                   | 是              |

### 2.2 全局 Top 12 模块（MEASURED，按生成字节）

| 模块                          |    KiB | 占 Playground 全部 JS 的比例 |
| ----------------------------- | -----: | ---------------------------: |
| `@babel/standalone`           | 2109.2 |                        41.3% |
| `@babel/parser`               |  286.7 |                         5.6% |
| `@codemirror/view`            |  189.3 |                         3.7% |
| `react-dom-client.production` |  170.3 |                         3.3% |
| `@lezer/javascript`           |   75.9 |                         1.5% |
| `@babel/types`                |   70.1 |                         1.4% |
| `packages/core/runtime-dom`   |   60.5 |                         1.2% |
| `@remix-run/router`           |   47.2 |                         0.9% |
| `@codemirror/state`           |   45.8 |                         0.9% |
| `@vue/runtime-core`           |   37.0 |                         0.7% |
| `playground-engine`           |   36.0 |                         0.7% |
| `@codemirror/autocomplete`    |   34.1 |                         0.7% |

### 2.3 确凿的重复代码（MEASURED）

**问题 1：两份 TypeScript/JSX 解析栈同时存在。**

- `playground-engine` 静态依赖 `@babel/parser`（286.7 KB 进首屏），
  用于 `analysis.ts`、`hmr.ts`、`preview.ts` 的 AST 遍历。
- `preview.ts` 的 `stripTypeScript()` **另外**动态导入 `@babel/standalone`
  （2,109.2 KB），只用了它的 `typescript` preset 与一个自写 `loopBudgetPlugin`。
- 两者解析的是**同一批用户源码**：Rust/WASM 编译器已产出 TS/TSX 的编译结果，
  随后 `stripTypeScript` 再让 Babel 解析一遍，接着 `parse()` 又让 `@babel/parser` 解析第三遍。

这是真实的 `parse → transform → parse` 三段重复，不是估算。

**问题 2：React 与 Vue 被命名为 `runtime-dom`。**

`bulk` 归因显示 252 KB 的 chunk 内是 `react-dom-client.production`（170.3 KB）、
`@vue/runtime-core`（37.0 KB）、`@vue/reactivity`（15.5 KB）、`react`（7.4 KB）、
`@vue/runtime-dom`（6.0 KB）—— **没有任何 Zeus 代码**。
Rolldown 用看到的第一个共享模块名给 chunk 命名，于是它继承了
`runtime-dom.esm-bundler` 这个名字。这直接制造了"两个不同大小的 runtime-dom"
这一观察，也让任何按文件名判断体积的分析得出错误结论。

### 2.4 依赖分层判定（MEASURED）

| 阶段      | 资源                                                                                 | 传输（Brotli） |
| --------- | ------------------------------------------------------------------------------------ | -------------: |
| 初始加载  | rolldown-runtime 675 + Zeus runtime 25,185 + engine 92,360 + CSS 4,132 + main 33,180 |      155,532 B |
| 首次编辑  | code-editor-impl 30,270 + CodeMirror 共享 126,522                                    |      156,792 B |
| 首次编译  | wasm 343,496 + Babel 377,813（+ highlight 863）                                      |      722,172 B |
| WebC 专项 | `vendor-react` + `vendor-vue`（仅 WebC studio 预览）                                 |       84,040 B |
| Sandbox   | sandbox 108 KB 的独立入口                                                            |   sandbox 页面 |

不同 origin 下无法共享的代码：`sandbox.html` 与 `host.html` 是独立入口，
在 opaque origin 下运行，**不能**与主页面共享已下载的 `runtime-dom` chunk
（缓存按 origin 隔离）。这是安全边界，不可优化，也不应优化。

### 2.5 可延迟加载项（基于实测）

已实施：`highlight.ts`（CodeMirror 解析器）移出首屏。

仍可延迟（未实施，见 §6）：

- Babel 的 2,109 KB 只在用户真正编辑并触发预览时才需要，
  但当前在首次编译就被拉取。改为"首次点 Output 或首次遇到 TS 语法时"可再省。
- `vendor-react` / `vendor-vue` 只在 WebC studio 的消费预览里需要。

### 2.6 与 2026-11-07 报告的对比（MEASURED）

| 指标                      |  2026-11-07 |     本次（优化前） | 本次（优化后） |
| ------------------------- | ----------: | -----------------: | -------------: |
| main chunk raw            |    66,983 B |          586,516 B |  **138,132 B** |
| CodeMirror lazy chunk raw |   529,595 B | 92,155 B（拆分后） |       92,155 B |
| Compiler assets raw       | 3,754,555 B |        3,754,555 B |    3,754,555 B |
| 首次可编辑                |      265 ms |           3,467 ms |       3,364 ms |
| 首次预览                  |      495 ms |             188 ms |         163 ms |
| WASM 编译                 |      6.5 ms |                  — |              — |

**必须区分三种口径**：

- 未压缩静态资源：4,907,018 B（11-07）→ 4,875,600 B（本次优化前，含 wasm）。
- HTTP 压缩传输量：637.4 KB（Brotli，优化前）→ 610.6 KB（优化后）。
- Resource Timing 实测：首次可编辑 3,467 → 3,364 ms，首次预览 188 → 163 ms。

**11-07 与本次的首屏毫秒数不可直接比较**：11-07 的数据采于本机无压缩静态服务、
且当时 main chunk 只有 67 KB。本次首次可编辑的 3.3 秒主要花在
142 KB 的 engine chunk 与 92 KB 的主入口上，以及本机 Playwright 冷启动开销。
这不是回归，是测量条件不同。**结论只使用同一轮内的前后对比。**

### 2.7 冷/热缓存与限速（MEASURED）

Playground（优化前构建）：

| 场景                    |     load |    ready |     传输 |     解码后 |
| ----------------------- | -------: | -------: | -------: | ---------: |
| 冷、无限速              | 4,388 ms | 7,754 ms | 637.4 KB | 2,720.1 KB |
| 冷、Slow 4G             | 2,064 ms | 2,267 ms | 305.0 KB | 1,209.0 KB |
| 冷、Fast 3G             | 5,839 ms | 6,046 ms | 305.0 KB | 1,209.0 KB |
| 热（同 context reload） |   167 ms |        — |     0 KB |          — |

Admin：

| 场景        |     load |    传输 |   解码后 |
| ----------- | -------: | ------: | -------: |
| 冷、无限速  |   594 ms | 88.0 KB | 371.8 KB |
| 冷、Slow 4G |   794 ms | 88.0 KB | 371.8 KB |
| 冷、Fast 3G | 2,295 ms | 88.0 KB | 371.8 KB |
| 热          |   170 ms |    0 KB |        — |

限速场景的传输量低于无限速场景，是因为限速下 worker 与 wasm 的请求
在 `load` 事件前尚未全部完成。**同一场景内的前后对比**才是有效比较。

### 2.8 首次编译网络瀑布图（MEASURED）

起点为第一个请求，毫秒：

```
     0 →    47       837 B  /
    60 →    74       675 B  /assets/rolldown-runtime-*.js
    61 →   196    25,293 B  /assets/runtime-dom.esm-bundler-CY9v_j9-.js   ← 真正的 Zeus runtime
    61 →   224     4,132 B  /assets/main-*.css
    61 →   845    92,384 B  /assets/playground-engine-*.js
    61 → 1,855   159,458 B  /assets/main-*.js                              ← 优化前；优化后 33,180 B
 1,933 → 2,060    30,361 B  /assets/code-editor-impl-*.js
 2,046 → 4,869   339,427 B  /assets/zeus-compiler-*.wasm
 5,087 → 8,334   377,798 B  /assets/babel-*.js                            ← 首屏最长的单次下载
```

里程碑：首次可编辑 3,467 ms；首次预览 188 ms；编辑→预览 739 ms；WebC 切换 54 ms。

**Babel 是唯一一个在首次预览之后才开始加载、却占满 3.2 秒的请求。**
它的加载起点（5,087 ms）晚于预览就绪，说明它由首次 `stripTypeScript` 触发，
而该调用发生在预览链路里。

---

## 3. Admin

### 3.1 chunk 与体积（MEASURED）

| chunk                       | raw KiB | gzip KiB | Brotli KiB |
| --------------------------- | ------: | -------: | ---------: |
| `index-*.js`                |   332.5 |     95.0 |       80.1 |
| `index-*.css`               |    38.7 |      6.6 |          — |
| `zw-data-grid.entry-*.js`   |    40.9 |     12.9 |       11.7 |
| 7 个 `zw-dialog-*.entry.js` | 1.5–2.7 |  0.7–1.2 |    0.6–1.1 |
| `zw-input.entry-*.js`       |     3.5 |      1.4 |        1.2 |

未认证登录页只加载 `index-*.js` + CSS + `/api/auth/session`，
实测 88.0 KB 传输 / 371.8 KB 解码。DataGrid 与 Dialog 是 WebC entry，
按需加载，不阻塞登录页。

### 3.2 主 chunk 归因（MEASURED）

| 模块                                 |  KiB | 说明                                     |
| ------------------------------------ | ---: | ---------------------------------------- |
| `src/pages.tsx`                      | 50.2 | **九个页面在同一个文件里，全部静态导入** |
| `@remix-run/router`                  | 47.0 | 路由解析器                               |
| `packages/core/runtime-dom`          | 42.1 | Zeus runtime                             |
| `@zeus-web/data-grid`                | 26.3 | 见 §3.3                                  |
| `packages/core/signal/internal`      | 18.8 | 响应式核心                               |
| `src/shell/shell.tsx`                | 16.8 | 外壳                                     |
| `@formatjs/icu-messageformat-parser` | 15.9 | i18n 解析器                              |
| `@zeus-web/data-grid` viewport       | 14.6 |                                          |
| `@zeus-js/web-c-runtime`             | 10.2 |                                          |
| `packages/core/router`               |  9.2 |                                          |
| `src/locales/{en,zh-CN}.ts`          | 17.5 | 两份语言包同时打入                       |

### 3.3 发现的 eager import（MEASURED）

1. **`pages.tsx` 是单文件、无路由级拆分。** 2059 行里定义了九个页面
   （`OverviewPage`、`UsersPage`、`UserPage`、`ReportsPage`、`ErrorPage`、
   `AuditPage`、`RolesPage`、`SettingsPage`、`UploadPage`），
   `router.tsx` 一次性静态导入全部九个。任何用户访问登录页都要下载
   从未显示的 Reports/Audit/Roles/Upload 代码。
2. **两份语言包同时进首屏**（`en.ts` 8.8 + `zh-CN.ts` 8.7 KiB）。
3. **`@zeus-web/data-grid` 同时出现在主 chunk（26.3 KiB）和独立 entry（40.9 KiB）。**
   主 chunk 里的那份是 `wc/auto` 注册代码，entry 里是组件本体 —— 不是重复，
   但主 chunk 承担了注册开销。

### 3.4 小型 JS chunk 的请求成本（MEASURED）

Admin 除主 chunk 外有 **9 个 1.5–41 KB 的小 chunk**。在 HTTP/1.1 下
每个都是一次额外往返；在 HTTP/2 下多路复用会缓解，但仍有一次请求头开销。
**不建议**为了减少请求数把它们合并回主 chunk：它们正是 DataGrid/Dialog
按需加载的实现方式，合并会把这些代码推回登录页首屏。

**优化建议的取舍**：路由级拆分（§6.1）会增加 chunk 数量，
但减少的是**首屏字节**；对 Admin 这种"登录页 ≠ 主界面"的应用，
字节比请求数更重要。

---

## 4. Docker 镜像

### 4.1 复现的缺陷（MEASURED）

`admin-image.yml` 原门禁：

```bash
docker buildx imagetools inspect "${IMAGE}:main" --format '{{json .Manifest}}' > /tmp/manifest.json
node -e 'const bytes = (m.layers || []).reduce((a, l) => a + l.size, 0) ...'
```

对 `ghcr.io/baicie/zeus-admin:main` 实测该命令的输出：

```json
{
  "mediaType": "application/vnd.oci.image.manifest.v1+json",
  "digest": "sha256:cdc920027ebe543166b7dc987c1ff8ba3b98b29b4ef4923ff1ced01f5f0a935b",
  "size": 2002
}
```

**它没有 `layers` 字段。** `{{json .Manifest}}` 返回的是 manifest 的
**descriptor**，不是 manifest 本体。因此 `(m.layers || [])` 恒为空数组，
体积恒为 `0.0 MB`，`mb > budget` 恒为假 —— **门禁从未生效过**。
CI 里那行 `image size: 0.0 MB (budget 120 MB)` 就是这个缺陷，
不是镜像真的只有 0 MB。

### 4.2 修复后的真实值（MEASURED）

用 `--raw` 取真正的 manifest 后：

| 项     | 值                                                                        |
| ------ | ------------------------------------------------------------------------- |
| 平台   | linux/amd64                                                               |
| digest | `sha256:cdc920027ebe543166b7dc987c1ff8ba3b98b29b4ef4923ff1ced01f5f0a935b` |
| 层数   | 9                                                                         |
| 体积   | **76.7 MB**（80,422,130 B）                                               |
| 预算   | 120 MB                                                                    |
| 结果   | PASS                                                                      |

与 `docs/deployment/image-audit-2026-11-11.md` 记录的 **76.6 MB** 一致
（0.1 MB 差异为不同构建批次）。这交叉验证了修复的正确性。

### 4.3 修复覆盖的失败模式（MEASURED，34 个单测）

新门禁拒绝以下全部情形，且每种都有测试：

| 情形                     | 修复前         | 修复后                                       |
| ------------------------ | -------------- | -------------------------------------------- |
| descriptor 而非 manifest | 0.0 MB 通过    | `manifest-without-layers` 失败               |
| 空 layers 数组           | 0.0 MB 通过    | `empty-layers` 失败                          |
| 每层 size 为 0           | 0.0 MB 通过    | `zero-size` 失败                             |
| size 不是数字/为负       | 静默相加或 NaN | `invalid-layers` 失败，并列出每一层          |
| 层 digest 非 sha256      | 忽略           | `invalid-layers` 失败                        |
| 无 mediaType             | 忽略           | `missing-media-type` 失败                    |
| 未知 mediaType           | 忽略           | `unsupported-media-type` 失败                |
| 多平台 index             | 0.0 MB 通过    | 按 `--platform` 精确选择；目标平台缺失则失败 |
| index 中同平台重复       | 取第一个       | `ambiguous-platform` 失败，拒绝猜测          |
| 无法测量                 | 显示 0         | **UNMEASURED**，exit 1                       |

---

## 5. 新增的体积预算与回归保护

### 5.1 此前的问题

`scripts/size/size-report.ts` 只覆盖 5 个文件，阈值是硬编码常量，
没有基线、没有归因、没有历史。第 6 个文件变大它完全看不见。
`docs/internal/pr34-size-budget-evidence-2026-11-04.md` 记录的做法是
"把实测值写进上限"—— 这正是需求里禁止的做法。

### 5.2 现在的结构

| 文件                                               | 作用                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| `scripts/size/build-size-report.ts`                | 扫描全部公共包产物，测 raw/gzip/Brotli，按规则与基线评估             |
| `scripts/size/build-size-report-cli.ts`            | CLI，输出 JSON + Markdown，`--ci` 决定退出码                         |
| `scripts/size/size-budget.json`                    | 27 条规则，**每条都写明理由**，均为"基线 + 容忍度"而非"当前值即上限" |
| `scripts/size/baseline/2026-11-12.json`            | 230 个产物在 `11a7bbfc` 的实测值                                     |
| `scripts/size/__tests__/build-size-report.spec.ts` | 29 个单测                                                            |

规则的形式是明确的两种，不会混淆：

- **绝对上限**（`limitKiB`）：对"必须不超过某个产品要求"的产物。
- **基线容忍度**（`tolerancePercent`）：对"不应无理由漂移"的产物。
  例如 `runtime-dom` 是 10%（约一个中等特性的量），`shared` 是 20%
  （7.7 KiB 的基数下更小的相对带宽没有意义）。

### 5.3 关键设计：不测即失败

| 情形                         | 结果                                             |
| ---------------------------- | ------------------------------------------------ |
| 产物有规则且在预算内         | `PASS`                                           |
| 产物超预算                   | `REGRESSION`，exit 1                             |
| 产物没有任何匹配规则         | `NO_BUDGET` —— **不是 PASS**，提醒有人欠一个决定 |
| 规则是基线相对但没有基线条目 | `REGRESSION`                                     |
| 已发布包没有产物             | `UNMEASURED`，`--ci` 下 exit 1                   |
| 规则既无上限也无容忍度       | `REGRESSION`（配置错误）                         |

### 5.4 验证（MEASURED）

| 验证                                                   | 结果                                                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| 29 个报告单测 + 29 个门禁单测                          | 58 passed                                                                                        |
| 对当前 HEAD 全量报告                                   | 230 measured / 230 pass / 0 regression / 0 NO_BUDGET                                             |
| 人为给 `signal.esm-browser.prod.js` 追加 4 KB 随机字节 | 正确报 `gzip 11045 B exceeds the baseline 6320 B by 74.8% (tolerance 15%)`，exit 1，并指名该产物 |
| 2 个脚手架 CLI（`create-zeus`、`zeus-ui`）无产物       | 正确报 `UNMEASURED` 并标注为"已声明豁免"；删除 `resource/dist` 后正确报"意外缺失"并 exit 1       |

### 5.5 CI 接入（MEASURED by file inspection）

`ci.yml` 的 `build` job 新增：

- `pnpm size:report:ci` —— 失败即失败该 job。
- 上传 `build-size-report` artifact（保留 30 天）。
- 把 `size-report.md` 追加到 `$GITHUB_STEP_SUMMARY`。

`admin-image.yml` 的体积检查改为独立 step 调用
`scripts/release/image-size-gate-cli.ts`，summary 写入 job summary。

**artifact 上传与 job summary 的 CI 行为为 `NOT_RUN`** —— 本机无法执行 GitHub Actions。
两者的命令与路径已本地逐一验证（`cat temp/size/size-report.md` 可正确渲染）。

---

## 6. 可优化与不可优化

### 6.1 已实施（MEASURED）

| 改动                             | 效果                                                                                     | 验证                                                      |
| -------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `highlight.ts` 改为动态导入      | main chunk 586,516 → **138,132 B（−76.5%）**；首屏传输 637.4 → 610.6 KB                  | Chromium UX 门禁 103 项 PASS；Playground editor 门禁 PASS |
| Playground vendor chunk 显式命名 | `runtime-dom-*` 252 KB 拆为 `vendor-react` 189 KB + `vendor-vue` 62.8 KB；**总字节不变** | 加载瀑布图逐请求一致                                      |
| Docker 体积门禁重写              | 0.0 MB → 真实 76.7 MB；10 类失败模式全部拦截                                             | 34 个单测 + 真实镜像                                      |
| 结构化体积报告                   | 5 → 230 个产物；基线 + 理由化预算                                                        | 58 个单测 + 端到端回归注入                                |

### 6.2 可优化但本轮未做（需独立验证）

| 机会                                              | 量级（ESTIMATED）                   | 为何未做                                                                                                                                                                                                       |
| ------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 用 WASM 编译器取代 `@babel/standalone` 的 TS 剥离 | 最多省 2,109 KB raw / 564 KB Brotli | Rust 编译器当前**不做** TS 类型剥离（只用 `SourceType::tsx()` 解析）。要取代 Babel，得先实现类型剥离 + 循环预算注入的等价能力，并证明诊断、sourcemap、循环预算语义完全一致。这是编译器能力变更，不是体积微调。 |
| 用 `oxc` 取代 `@babel/parser`（engine 内 287 KB） | 省 ~200 KB raw                      | 同上，且 `@babel/parser` 的 AST 形状被 `analysis.ts` / `preview.ts` / `hmr.ts` 直接依赖。                                                                                                                      |
| Admin 路由级懒加载九个页面                        | 首屏减约 50 KB raw / 15 KB gzip     | 需要每页的加载/错误边界与现有 `check:admin` 门禁重新对齐。                                                                                                                                                     |
| Admin 语言包按 locale 拆包                        | 减约 8.7 KB raw                     | 会引入一次异步加载，需确认不产生语言闪烁 —— 而"避免闪烁"正是现有设计的明确目标。                                                                                                                               |
| `wasm-opt -Oz`                                    | `NOT_RUN`，未知                     | 本机无 binaryen。且必须用 `check:compiler-wasm` 逐字节一致性验证后才能采纳。                                                                                                                                   |
| `opt-level = "s"` / `lto = "fat"`                 | `NOT_RUN`                           | 必须用 `bench:compiler-optimization` 证明编译性能未退化。                                                                                                                                                      |

### 6.3 不可优化（有明确理由）

| 项                                                | 理由                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Playground 的 WASM 编译器 1.5 MB（Brotli 343 KB） | 这是 Rust 编译器的全部能力。删除任何部分都是删功能。                               |
| `runtime-dom` / `zeus` 的 `esm-browser` 全量导出  | 按发布契约，CDN 入口必须包含全部能力。tree-shaking 只对 `esm-bundler` 消费者生效。 |
| Sandbox 与主页面的代码不共享                      | opaque origin 下缓存按 origin 隔离。这是安全边界，不可跨越。                       |
| 循环预算、沙箱隔离、超时保护                      | 需求明确禁止为体积删除。本审计未触碰任何一项。                                     |
| 七个 native 平台各一份 `.node`                    | 平台条件安装，每个消费者只装一个。                                                 |

---

## 7. 重复代码的确凿证据

| 证据             | 内容                                                                                                                                                                       |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 三段解析         | `compileProject` → Rust 编译（解析 1）→ `stripTypeScript` 用 `@babel/standalone` 解析并重写（解析 2）→ `parse()` 用 `@babel/parser` 再解析（解析 3）。三次解析同一份源码。 |
| 双份解析器体积   | `@babel/standalone` 2,109.2 KB + `@babel/parser` 286.7 KB + `@babel/types` 70.1 KB，合计 **2,466 KB**，占 Playground 全部 JS 的 48.3%。                                    |
| chunk 误命名     | `runtime-dom.esm-bundler-Cyicwoay.js`（252,313 B）归因结果为零 Zeus 代码，完全是 React 19 + Vue 3。                                                                        |
| Admin 双份语言包 | `en.ts`（8.8 KiB）与 `zh-CN.ts`（8.7 KiB）同时进首屏。                                                                                                                     |
| Admin DataGrid   | 注册代码（26.3 KiB）在主 chunk，组件本体（40.9 KiB）在独立 entry —— 非重复，但需知悉。                                                                                     |

---

## 8. 剩余风险

1. **Babel 的延迟加载未进一步优化。** 首次编译仍需 377,813 B（Brotli）。
   在 Slow 4G 下这是首屏体验的主要成本。
2. **`preview.ts` 的 `stripTypeScript` 与 Rust 编译器输出存在语义重叠。**
   若未来 Rust 侧增加类型剥离，必须保证两边的循环预算注入完全一致，
   否则沙箱的循环保护会被绕过。
3. **Admin 主 chunk 随页面数线性增长。** 新增页面会直接加剧首屏体积。
4. **体积预算的容忍度是人工判断。** 27 条规则的理由已写进文件，
   但"10% 是否合适"需要维护者在真实迭代中校准。
5. **wasm 与 native 的优化空间未知。** 未安装 binaryen 意味着本轮无法给出结论；
   任何"wasm 可再省 20%"的推断都缺乏依据。
6. **Firefox / WebKit 未验证。** 本机只装 Chromium，跨引擎行为 `NOT_RUN`。

---

## 9. 复现命令

```bash
# 框架包构建与体积
pnpm build

# 结构化体积报告
pnpm size:report          # 只报告
pnpm size:report:ci       # 超预算即失败
pnpm size:baseline        # 写入新基线（必须附带理由）

# Docker 体积门禁
node --import tsx scripts/release/image-size-gate-cli.ts \
  --reference ghcr.io/baicie/zeus-admin:main --platform linux/amd64 --budget-mb 120

# 单测
pnpm exec vitest run scripts/size/__tests__ scripts/release/__tests__/image-size-gate.spec.ts

# Playground 行为门禁
PLAYGROUND_BROWSERS=chromium node --import tsx scripts/playground/check-playground-editor.ts
PLAYGROUND_BROWSERS=chromium node --import tsx scripts/playground/check-playground-ux.ts
```
