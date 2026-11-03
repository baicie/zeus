# PR-18 Compiler 协同 HMR 证据

本文件是 RFC-017 的早期基线，不能单独证明设计包 PR-18 已完成。后续 compiler signature /
literal binding 实现及仓库外验收见 [RFC-019 补齐报告](./pr18-binding-hmr-evidence-2026-11-03/README.md)。

记录时间：2026-11-03。工作分支：`codex/pr18-hmr`。

## 验收范围

PR-18 收紧并验证 RFC-017 的可证明安全边界：普通注释改动保留现有 root、DOM identity、
signal state 和 listener；可执行 TSX 改动完整 dispose-remount；异常 cleanup 不会阻止新模块
继续挂载；SSR、production、component-only 和显式 `import.meta.hot` 模块不注入自动边界。

## 实际验证

| 命令                                                                                                                                                  | 结果                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm exec vitest --run --project unit packages/devtools/vite-plugin/__tests__/hmr.spec.ts packages/devtools/vite-plugin/__tests__/transform.spec.ts` | PASS，76 tests                                                                                                                                         |
| `pnpm check:hmr-browser`                                                                                                                              | PASS，真实 Vite dev server + Chromium、Firefox、WebKit；注释编辑保持 state/DOM/listener，执行编辑释放旧 root 并生成新 root，更新后 listener 仍只有一份 |
| `pnpm build`                                                                                                                                          | PASS；产物构建完成，已有 vite-plugin `node:crypto` external warning 不影响结果                                                                         |
| `pnpm check`                                                                                                                                          | PASS                                                                                                                                                   |
| `pnpm lint`                                                                                                                                           | PASS                                                                                                                                                   |
| `pnpm format-check`                                                                                                                                   | PASS                                                                                                                                                   |
| `pnpm check:docs`                                                                                                                                     | PASS                                                                                                                                                   |

浏览器报告写入 `temp/hmr-browser-report/report.json`，脚本执行后自动删除临时 Vite fixture。

## 设计边界

状态保留仍只适用于 comment-only 更新；任何会改变可执行模块语义的编辑都走完整销毁和重挂。
该门禁验证的是 Vite dev server 的真实模块更新链路，不把单元测试中的 mock `import.meta.hot`
生命周期当作浏览器证据。
