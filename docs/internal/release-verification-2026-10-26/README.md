# 2026-10-26 发布后复核

本次发布沿用 beta 线：框架 `0.1.1-beta.20`、Zeus UI `0.1.0-beta.34`；独立工具包为
`@zeus-js/vite-plugin@0.0.5` 与 `create-zeus@0.1.5`。UI `0.1.0` stable 按用户决定后置。
精确 commit、run、artifact digest 与复核方法见 [summary.json](./summary.json)。

| 产物              | 发布 run                                                                  | 结论                                                                     |
| ----------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 框架 29 包        | [40310510887](https://github.com/baicie/zeus/actions/runs/40310510887)    | success；含七平台 native、provenance、Node 22/24 registry compiler smoke |
| Vite plugin 0.0.5 | [40316822160](https://github.com/baicie/zeus/actions/runs/40316822160)    | success；`latest=0.0.5`                                                  |
| create-zeus 0.1.5 | [40318172136](https://github.com/baicie/zeus/actions/runs/40318172136)    | success；`latest=0.1.5`；四模板真实 registry 依赖与浏览器门禁通过        |
| UI 40 包 beta.34  | [40326776158](https://github.com/baicie/zeus-ui/actions/runs/40326776158) | success；40 包发布后 smoke/provenance 验证通过，`beta=0.1.0-beta.34`     |

## D-001 验收

[原发布 artifact](./create-zeus-registry.json) 来自 release commit
`7b9c9b5ddaf6ece22d462e6667645c6ac140fd62`，四模板均无依赖版本覆盖。它验证安装、
typecheck、production build、dev/preview 浏览器交互，以及提供 test 脚本的模板测试。
Application 计数依次达到 0、1、2，网络空闲后仍为 2；Component Library 验证属性更新与 slot。

该门禁使用发布提交的 scaffold 源码；[npm tarball 比对](./create-zeus-tarball.json)
独立确认已发布 `create-zeus@0.1.5` 的 26 个模板文件与同一提交逐字节相等，发布入口包含
四个 template ID。原任务要求创建、安装、dev/build/check 可用，因此 D-001 可以关闭。
这里没有把自动化门禁表述为真人计时；D-006 仍以用户约十分钟、有协助的实际体验为依据。

## M2 生命周期复核

[原始 report](./ui-mode-parity.json.txt) 与[环境说明](./ui-mode-parity-context.json.txt) 原样保存：
UI 全仓对齐真实 registry beta.20 后，Chromium/Firefox/WebKit × eager/lazy 六组合通过，
七阶段观察相等，differences 为零。该报告的 UI 源码提交为 `b54fed8`，它证明合并前候选的
真实组件生命周期；已发布 beta.34 的跨框架产物验收由新 Golden 报告另行记录。

## 发布处置与范围

- 两仓 `Release` environment 的 `protection_rules` 均为空；保留 environment 供发布 secrets 使用。
- 重复 release dispatch、一次 registry 传播延迟后的验证失败保留为执行记录。最终成功 run
  不会把先前失败改写为成功；本次复核没有再次 dispatch 或发布。
- 历史 native npm `latest` 清理按用户决定放弃；本次目标版本的来源与发布验证仍保留。
- 完整 `02-DESIGN.md` 仍缺失。260 行片段与完整任务清单不能代替完整设计终审。
- `temp/roadmap-audit-2026-10-26.json` 是发布前审计底稿，版本和 PR 状态已经过时。
