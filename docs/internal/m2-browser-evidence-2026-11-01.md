# M2 浏览器与消费者证据（2026-11-01）

分支：`codex/zeus-0.2.0-progress`。环境：macOS（Apple Silicon）、Node 24.18、Playwright 1.64.1
（Chromium 1248、Firefox 157.0、WebKit 27.2）。npm 依赖经 `--registry https://registry.npmmirror.com`
安装；CI 使用默认官方源。

## 打包消费者矩阵（PR-12/13/14）

`pnpm check:packed-consumers --registry https://registry.npmmirror.com`：组件库与全部 Zeus 包先 `pnpm pack`，
再分别安装进独立的 Native、React 18、React 19、Vue 3 工程。每个工程依次执行 SSR、类型检查、Vite 构建、
bundle 检查与三引擎浏览器用例，36 个步骤全部通过（`temp/packed-consumers/report.json`）。

bundle 检查从 Vite manifest 定位组件实现模块：已渲染的 `z-packed-button` 实现必须存在，未使用的
`z-packed-unused` 实现只能被 tree-shake 或留在无静态导入的 lazy chunk 中。

| 消费者   | 未使用组件  | 初始 JS（gzip） | 全部 JS（gzip） |
| -------- | ----------- | --------------: | --------------: |
| Native   | tree-shaken |        21,576 B |        97,508 B |
| React 18 | tree-shaken |         4,500 B |        72,721 B |
| React 19 | tree-shaken |         4,506 B |        96,205 B |
| Vue 3    | tree-shaken |         4,602 B |       121,928 B |

“全部 JS”包含框架本身（React/Vue）及测试脚本，作为基线记录，不构成阈值。

## 表单关联（PR-10）

`pnpm check:form-associated-browser`：三引擎中 FormData 初始值与更新值、`formAssociated`、
fieldset disabled、reset 回调，以及 `ElementInternals.labels` 报告 `<label for>`、点击 label 会点击元素，
全部通过。validity 与 stateRestore 由打包消费者用例覆盖。IME 组合输入无法在三引擎中用 Playwright 统一驱动，
`check:form-associated-browser` 现补充 compositionstart / `InputEvent.isComposing` / compositionend
序列：三引擎均验证组合期间不提交、结束后提交、FormData 读取组合结果、reset 恢复初值。真实 OS IME UI
仍无法用 Playwright 统一驱动；这里验证的是标准的浏览器组合事件契约。

## 无障碍与缩放（PR-11）

`pnpm check:a11y-browser`：Shadow DOM 按钮（默认 slot 文本）、Shadow DOM 卡片（具名 slot 标题）与
Light DOM 带 label 输入框，在三引擎得到同一棵 ARIA 树：

```text
- main:
  - button "Save changes"
  - heading "Billing" [level=2]
  - text: Due on Friday Email
  - textbox "Email"
```

在 device scale factor 1、2 与 200% 页面缩放下 slot 文本均未被裁剪，200% 缩放时 ARIA 树不变：

| 引擎     | 1×（宽 × 高） | 200% 缩放 | 2× DPR   |
| -------- | ------------- | --------- | -------- |
| Chromium | 100 × 21      | 201 × 43  | 100 × 21 |
| Firefox  | 98 × 22       | 184 × 44  | 98 × 22  |
| WebKit   | 89 × 18       | 165 × 36  | 89 × 18  |

嵌套 overlay 由 `zeus-ui` 的 Dialog runtime 测试覆盖：内层 Dialog 的 Tab 焦点陷阱独立生效，
Escape 只关闭最内层 Dialog，外层保持打开；实现通过最近 `dialog-content` 边界过滤冒泡事件。
