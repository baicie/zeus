# Admin UX / 无障碍 / 性能报告

日期：2026-11-14  
基线：Core `69f494f2`  
测量环境：macOS 24.6.0 / darwin arm64 / Node 24.16.0 / Chromium（Playwright 1.64.1，headed）

---

## 1. 本轮修复：高对比度模式

### 问题

`prefers-reduced-motion` 在 3 处已实现，但 **`forced-colors` / `prefers-contrast` 完全没有支持**。

影响是具体的：在 Windows 高对比度模式下，浏览器会用自己的系统色替换作者颜色，但**不会替换 `transparent`**。Admin 有若干控件使用 `border: 1px solid transparent`，靠 hover 时的背景变化暗示可交互。在强制色彩下：

- 边框永远不出现；
- 聚焦态与静止态视觉相同；
- 依赖 `oklch(var(--border))` 的分隔线可能完全不可见。

### 修复

`examples/admin/src/styles/base.css` 新增：

```css
@media (forced-colors: active) {
  button,
  [role='button'],
  input,
  select,
  textarea,
  .state-block,
  .table-shell {
    border-color: ButtonBorder;
    forced-color-adjust: auto;
  }

  :focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
}
```

### 验证（真实浏览器，非模拟）

用真实的 Admin 构建（`pnpm --filter @zeus-js/example-admin build`），
Playwright 模拟 `forced-colors: active`：

```
ADMIN_FC: {
  "count": 1,
  "sample": [{ "text": "Sign in", "borderColor": "rgb(0, 0, 0)", "borderWidth": "1px" }],
  "forced": true
}
```

`borderColor` 是系统色而非 `transparent`，宽度 1px。**修复在渲染层生效。**

构建产物确认：`grep -c "forced-colors" examples/admin/dist/assets/*.css` → `1`。

## 2. 性能测量

### 方法

- 10 次冷加载（`page.goto` + `waitUntil: 'load'`），每次重新导航；
- 指标：`domContentLoadedEventEnd - startTime`；
- 本地静态服务（`python3 -m http.server`），排除网络变量；
- 未做 CPU 节流。

### 结果

| 指标      | 值                                          |
| --------- | ------------------------------------------- |
| P50       | **109 ms**                                  |
| P95       | **144 ms**                                  |
| min / max | 79 / 144 ms                                 |
| 10 次样本 | 79, 80, 84, 86, 95, 109, 113, 115, 124, 144 |

**这是本地静态服务的数字，不是用户感知的首屏时间。** 它不含真实网络 RTT、CDN、TLS 握手。
不要把它当成生产性能指标引用。

## 3. 未测量项（明确记录）

| 项                             | 状态    | 原因                                 |
| ------------------------------ | ------- | ------------------------------------ |
| 200% / 400% 缩放下的布局       | NOT_RUN | 需要视觉回归基线                     |
| 键盘 Tab 顺序全页遍历          | NOT_RUN | `check:admin` 只覆盖对话框的焦点陷阱 |
| 屏幕阅读器（NVDA / VoiceOver） | NOT_RUN | 无法在 CI 中自动化                   |
| 表格大量数据（1000+ 行）       | NOT_RUN | 未构造数据                           |
| Playground 全部性能项          | NOT_RUN | 本轮聚焦 Admin                       |
| 高对比度下的视觉基线           | NOT_RUN | 只有计算样式断言，没有截图基线       |

**本轮只完成了一项修复和一项测量。** 其余是 NOT_RUN，不是 PASS。

## 4. 已有覆盖（未重复验证）

`pnpm check:a11y-browser` 已在仓库中存在，覆盖：

- Shadow DOM 与 Light DOM 的可访问名；
- 默认与具名 slot；
- device scale factor 1 与 2；
- 200% 页面缩放。

它验证的是**组件层**，不是 Admin 页面层。两者互补，不能互相替代。

## 5. 建议的后续

| 优先级 | 事项                                                                          |
| ------ | ----------------------------------------------------------------------------- |
| P2     | 给 `check:a11y-browser` 加一条 `forced-colors` 用例，覆盖主题包而不只是 Admin |
| P3     | Playground 的首次加载与编译延迟测量                                           |
| P3     | 表格 1000 行下的渲染时间                                                      |
