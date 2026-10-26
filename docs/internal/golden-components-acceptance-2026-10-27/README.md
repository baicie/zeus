# Golden Components 验收：UI 0.1.0-beta.34 / Zeus 0.1.1-beta.20

对应 B-003 / E-009 的 beta 线复验，替代 2026-10-23 那份 UI beta.33 / Zeus beta.18 结论作为**当前版本**的证据；旧报告仍保留为历史记录。UI `0.1.0` stable 按用户决定后置，本报告只声明 beta 产物已验收。

## 运行环境

- 报告 `createdAt`：`2026-10-26T17:15:23.467Z`（UTC）；本地执行时间 2026-10-27 01:15（Asia/Shanghai）
- Node `v22.12.0` / `darwin-arm64`
- registry：`https://registry.npmjs.org`（真实发布产物，无 `file:`/`link:` 替身）
- 框架：`0.1.1-beta.20`；UI：`0.1.0-beta.34`（UI source commit `a8826dd1f81560aaf6459d8d40a3e599f705f6e0`）

## 结果矩阵

| 维度         | 覆盖                                                                       | 结论                                                                                                                    |
| ------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 浏览器消费   | native / React 18 / React 19 / Vue 3 × Chromium / Firefox / WebKit = 12 组 | `12/12 passed`，每组 24 条断言（含 Dialog 默认 open 与可选 `nativeEvent` 策略）                                         |
| SSR import   | 4 种消费工程的 Node 无 DOM import                                          | `4/4 verified`，`domGlobals: absent`                                                                                    |
| 严格公开类型 | 4 种消费工程的 `public-consumer-types`                                     | `4/4 verified`，fixture sha256 `4e45ba74194868ecb595e0d24585e2e4da4c7314db0a62f8ea372990dd0f3671`                       |
| Manifest     | 4 消费 × 4 包 = 16 份                                                      | `16/16 verified`，sha256 与合同一致                                                                                     |
| 供应链       | 24 份 tarball / provenance 记录                                            | `24/24 verified`（integrity 与 registry `dist.integrity` 相等，SLSA subject 与 tarball sha512 相等，Sigstore 签名通过） |

Golden 包：`@zeus-web/button`, `@zeus-web/input`, `@zeus-web/dialog`, `@zeus-web/data-grid`。

## 复现

```bash
pnpm install
npx playwright install chromium firefox webkit
pnpm check:golden-components --output temp/golden-beta34
```

脚本会在隔离临时目录中用真实 registry 安装 UI 与框架 tarball，先跑 Node SSR import，再在三种浏览器执行 `requiredBrowserAssertions`，最后核对 Manifest、integrity 与 provenance。`temp/` 下的报告被 gitignore，只有本目录这份持久报告才算验收证据。

## 与 stable 的边界

本报告锁定 `0.1.0-beta.34` / `0.1.1-beta.20`。若后续发布 UI `0.1.0` stable 或新的框架版本，需要按同一矩阵重新出具报告，不能把 beta 结论直接迁移到稳定产物。
