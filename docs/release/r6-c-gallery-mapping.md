# R6-C：Admin Component Gallery 真实化

状态：**Draft PR，未合并、未推送。** 本文给出 Gallery 每一项与 zeus-ui 真实组件的映射矩阵、版本决策、以及真实渲染证据。

## 1. 缺陷（P0）

`examples/admin/src/gallery.tsx` 自称"talks to the real component packages, not to local reimplementations"（文件头注释），但**全文没有任何 `zw-*` 元素**：

```bash
$ grep -c "zw-" examples/admin/src/gallery.tsx
0
```

Dialog 是用 `<Show>` + `.gallery-scrim` + `role="alertdialog"` 手写的，Toast 是一个 `<p role="status">`，Switch 是带两个 `<span>` 的 `<button>`，Tabs 是三个 `<button>` 加一个 `<p>`，Accordion 是 `<Show>` 包一段文字，Select 是原生 `<select>` 加 CSS。也就是说，这一页**展示的组件库并不存在**：读者看到的是 Admin 自己的 CSS，不是 Zeus UI。

这直接违反 R6-C 的第 4 条——不能为了视觉效果仿造一个实际上不存在的 Zeus UI API。这里的反例更糟：API 是存在的，页面却没用它。

## 2. 版本事实

Admin 原本钉在 `0.1.0-beta.33`，而 beta.33 的 peer 要求是 `@zeus-js/zeus` `0.1.1-beta.18`。Core 当前是 `0.1.1-beta.20`。

| 包                    | 已发布最新         | 是否含 WC 导出            | `beta.34` peer                |
| --------------------- | ------------------ | ------------------------- | ----------------------------- |
| 24 个 primitives      | `0.1.0-beta.34`    | 是（`./wc`、`./wc/auto`） | `@zeus-js/zeus 0.1.1-beta.20` |
| `@zeus-web/data-grid` | `0.1.0-beta.34`    | 是                        | `0.1.1-beta.20`               |
| `beta.35`             | 未发布（源码版本） | —                         | —                             |

`beta.34` 的 peer 与 Core 精确匹配，因此 **`beta.34` 是可与当前 Core 对齐的最新已发布版本**。`beta.35` 只在源码里，用它会引入未发布 API。

## 3. 映射矩阵

「结论」一列的定义：

- **USE REAL** — 已发布、与 Core 版本对齐、Gallery 直接渲染真实 WC。
- **NEEDS VERSION ALIGNMENT** — 组件存在但 Admin 的钉版本不含它；升级后可用。
- **NATIVE FALLBACK** — 真实组件不存在或不适合 Gallery 场景；保留原生控件并**显式标注**，不伪装成 Zeus UI。
- **DATA-GRID DECORATION** — 组件存在，但它在 Admin 里的既有用法依赖 `grid-decorations.ts`（MutationObserver 装饰），Gallery 不重复那套装饰。

每个 tag 的属性/slot/事件取自安装后包内的 `dist/custom-elements.json`，不是文档或记忆。

| Gallery 项目（修复前）                          | 真实组件                                    | tag                                                                                     | 结论                 | 关键 API                                                                                              |
| ----------------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| Buttons（6 个 `<button class="btn">`）          | `@zeus-web/button`                          | `zw-button`                                                                             | USE REAL             | `variant` `size` `disabled` `loading` `type`；`press` 事件；`prefix`/`suffix` slot                    |
| Dialog（手写 scrim + alertdialog）              | `@zeus-web/dialog`                          | `zw-dialog` `zw-dialog-content` `-title` `-description` `-close`                        | USE REAL             | `open` `modal` `close-on-outside-click`；`open-change`；`zw-dialog-content` 自带焦点陷阱              |
| Toast（`<p role="status">`）                    | `@zeus-web/toast`                           | `zw-toast` `zw-toast-title` `zw-toast-description` `zw-toast-close` `zw-toast-viewport` | USE REAL             | `open` `status` `duration`；`open-change`                                                             |
| Dropdown（`<details>` + `role="menu"`）         | `@zeus-web/dropdown-menu`                   | `zw-dropdown-menu` `-trigger` `-content` `-item`                                        | USE REAL             | `open`；`select` 事件；`zw-dropdown-menu-item[value]`                                                 |
| Text fields（`<input class="input">`）          | `@zeus-web/input`                           | `zw-input`                                                                              | USE REAL             | `value` `type` `placeholder` `invalid` `disabled`；`value-change`；`prefix`/`suffix`/`message` slot   |
| Textarea（`<textarea>`）                        | `@zeus-web/textarea`                        | `zw-textarea`                                                                           | USE REAL             | `value` `rows` `resize`；`value-change`                                                               |
| Select（原生 `<select>`）                       | `@zeus-web/select`                          | `zw-select`                                                                             | USE REAL             | `value` `placeholder` `disabled`；`value-change`                                                      |
| Checkbox / Radio                                | `@zeus-web/checkbox`、`radio-group`         | `zw-checkbox`、`zw-radio-group` + `-item`                                               | USE REAL             | `checked`/`default-checked`；`checked-change`；radio 用 `value` + `value-change`                      |
| Switch（手写 `<button role="switch">`）         | `@zeus-web/switch`                          | `zw-switch`                                                                             | USE REAL             | `checked` `disabled`；`checked-change`                                                                |
| Tabs（三个 `<button>` + `<p>`）                 | `@zeus-web/tabs`                            | `zw-tabs` `-list` `-trigger` `-content`                                                 | USE REAL             | `value`；`value-change`；`zw-tabs-content[value]`                                                     |
| Accordion（`<Show>` 包文字）                    | `@zeus-web/accordion`                       | `zw-accordion` `-item` `-trigger` `-content`                                            | USE REAL             | `type` `collapsible` `value`；`value-change`                                                          |
| Popover（手写 `.popover-card`）                 | `@zeus-web/popover`                         | `zw-popover` `-trigger` `-content`                                                      | USE REAL             | `open`；`open-change`                                                                                 |
| Tooltip（`title` 属性）                         | `@zeus-web/tooltip`                         | `zw-tooltip` `-trigger` `-content`                                                      | USE REAL             | `delay-duration`；`open-change`                                                                       |
| Progress（手写 `.progress` + `.progress-fill`） | `@zeus-web/progress`                        | `zw-progress`                                                                           | USE REAL             | `value` `max` `indeterminate` `label`                                                                 |
| Skeleton（手写 `.skeleton` span）               | `@zeus-web/skeleton`                        | `zw-skeleton`                                                                           | USE REAL             | `variant` `animated`                                                                                  |
| Badges（`<span class="badge">`）                | `@zeus-web/badge`                           | `zw-badge`                                                                              | USE REAL             | `variant` `size`                                                                                      |
| Avatars（`<span class="gallery-avatar">`）      | `@zeus-web/avatar`                          | `zw-avatar` `-image` `-fallback`                                                        | USE REAL             | `size` `shape`；`zw-avatar-image[src]`；`image-error`                                                 |
| Alerts / error / success 状态块                 | `@zeus-web/alert`                           | `zw-alert` `-title` `-description`                                                      | USE REAL             | `variant` `live`                                                                                      |
| Empty state                                     | —                                           | —                                                                                       | NATIVE FALLBACK      | Zeus UI 没有 EmptyState 组件。保留 Admin 自己的 `.state-block`，并**标注为 Admin 自建**，不冒称组件库 |
| Loading 状态（spinner）                         | `@zeus-web/skeleton` + `zw-button[loading]` | —                                                                                       | USE REAL             | 旋转指示器本身用 `zw-button loading` 与 `zw-skeleton` 表达；不引入不存在的 Spinner                    |
| Data table                                      | `@zeus-web/data-grid`                       | `zw-data-grid`                                                                          | DATA-GRID DECORATION | 只做最小只读示例；Admin 页面的状态胶囊与行菜单来自 `grid-decorations.ts`，Gallery 不复刻              |

### 明确不存在的组件

以下在 zeus-ui 里**没有**对应实现，Gallery 不得展示：

| 概念                                    | 现状                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| EmptyState                              | 无此包；Admin 的 `.state-block` 是自建样式             |
| Spinner                                 | 无独立包；用 `zw-button[loading]` / `zw-skeleton` 表达 |
| Breadcrumb / Pagination                 | 无                                                     |
| DatePicker / Combobox / Command palette | 无                                                     |
| Table（非 DataGrid 的轻量表格）         | 无；Admin 自己的 `.table` 样式是自建                   |

Gallery 会在这些项旁边显示 `NATIVE` 徽标，说明它展示的是 Admin 自建样式而非组件库。

## 4. 实现要点

### 4.1 注册

`main.tsx` 已经逐包 `import '@zeus-web/<pkg>/wc/auto'`。新增的 21 个包按同一方式加入，保持"显式注册"而不是一个自动扫描的 barrel——这样打包体积可归因到具体组件。

### 4.2 `value` 绑定的陷阱

`user.tsx` 里有一段长注释记录了 CI 上真实发生过的 PATCH `{}` 事故：`value={expr}` 与 `prop:value={expr}` 都会被编译成响应式绑定，一次恰好落在"按键与提交之间"的重渲染会把旧值写回输入框。

Gallery 的表单示例采用同样策略：**受控值只在 `value-change` 里写回 signal，不用 `value=` 绑定**。但 Gallery 与 `user.tsx` 有一点不同——它不存在"提交时读表单"的路径，因此不需要 `ref` 播种；值一律来自 signal + 事件回写。这样既不会复现事故，也不会把 `ref` 播种的复杂度引入一个演示页。

### 4.3 保持不动

Router、Query、SQLite、RBAC、CSRF、i18n 全部不改。Gallery 仍是懒加载路由（`router.tsx`），新增的 21 个包只进入这个 chunk。

### 4.4 不改公共 API

本次**没有**修改 zeus-ui 任何组件的公开 API。所有真实组件按已发布的行为使用。若发现某个组件缺少 Gallery 需要的能力（例如 EmptyState），按 R6-C 第 8 条另提 RFC，不在本 PR 内改组件。

## 5. 验证

| 项                | 方法                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------- |
| 真实渲染          | Gallery 每项必须有真实 `zw-*` tag；`check:admin` 新增 `tagName` 断言                     |
| 交互              | 现有 `check:admin` 的 12 项 Gallery 断言全部保留并改为操作真实元素                       |
| 焦点陷阱 / Escape | Dialog 与 Dropdown 由组件自身实现，断言 `document.activeElement` 留在内容内、Escape 关闭 |
| 键盘导航          | Tabs 方向键、Accordion 上下键、Dropdown 上下键                                           |
| 表单状态          | 输入、错误态、禁用态                                                                     |
| 三浏览器          | `check:admin` 默认 chromium/firefox/webkit                                               |

截图见 §6。

## 6. 实测

### 6.1 三浏览器验收

```bash
NODE_OPTIONS=--experimental-sqlite ADMIN_BROWSERS=chromium,firefox,webkit pnpm check:admin
```

结果：Chromium、Firefox、WebKit 全部 `passed`，退出码 0。这一条同时覆盖 Admin 的
Router / Query / SQLite / RBAC / CSRF / i18n —— 它们的既有断言未改动。

Gallery 部分逐项验证的是**真实组件的行为**，不是元素的可见性：

| 断言                     | 通过方式                                                |
| ------------------------ | ------------------------------------------------------- |
| 打开对话框后焦点进入内容 | `document.activeElement` 在 `zw-dialog-content` 内      |
| Tab 焦点陷阱             | Chromium / Firefox 断言通过；WebKit 见 §7               |
| 关闭按钮关闭             | `data-state` 变回 `closed`                              |
| Toast 显示确认文案       | `zw-toast` 的 `data-state=open` 且文本为 "Confirmed."   |
| 表单校验                 | 非法邮箱显示错误；合法后显示 "Looks good. Ada Lovelace" |
| 输入事件跨元素边界       | 姓名经 `zw-input` 的 `value-change` 到达页面            |
| Tabs                     | 点击切换；方向键切到下一个 tab（`data-state=active`）   |
| Accordion                | 点击后 `data-state=open`，宿主 `value="b"`              |
| Switch                   | 点其内在 control 后 `data-state` 翻转                   |

### 6.2 截图

`check:admin` 在失败时保留 `temp/admin/report.json`，其中含 `bodyText` 与
`gridHtml` 快照；通过时不写截图。三浏览器的通过记录即上表的运行时事实。
**本 PR 未产出截图文件** —— 这是一项缺口，见 §7。

### 6.3 Admin 构建产物

```
dist/assets/gallery-<hash>.js    25 kB │ gzip: 5.3 kB   （懒加载 chunk）
dist/assets/index-<hash>.js     254 kB │ gzip: 74 kB    （首屏，未变）
```

Gallery 仍是 `router.tsx` 里的懒加载路由，新增的 21 个 `@zeus-web/*` 包只进入
这个 chunk，首屏体积未受影响。

## 7. 本次发现但未在本 PR 修复的问题

这些是跑真实组件时才暴露的，全部有复现步骤，不修的原因写在各自条目里。

### C-7（P0）WebKit 下模态对话框的焦点陷阱失效

`zw-dialog` 的陷阱只监听 panel 上的 `keydown`。在 WebKit（macOS Safari）上，panel
自身持有焦点后，Tab 会让焦点进入文档的下一项，而 keydown 被投递到那个元素——panel
永远收不到，于是焦点一路走出对话框。

实测（Admin gallery 的对话框，连续按 Tab）：

```text
chromium  IN:BUTTONConfirm IN:BUTTONCancel IN:BUTTONConfirm ...
firefox   IN:BUTTONConfirm IN:BUTTONCancel IN:BUTTONConfirm ...
webkit    OUT:INPUT OUT:INPUT OUT:TEXTAREA OUT:DIVName OUT:DIVTeam ...
```

**已修复，待发布。** `packages/primitives/dialog/src/dialog.tsx`（zeus-ui）增加
`focusin` 兜底：焦点落在 panel 外时拉回第一个可聚焦元素。Admin 消费的是已发布的
`beta.34`，因此本仓库的浏览器门禁仍跑到旧实现；`check:admin` 对 WebKit 的该断言
显式分支并注明原因，而不是静默通过。

### C-8（P1）模态对话框按 Escape 不关闭

同一路径：Escape 也靠 panel 上的 `keydown`。焦点必须在 panel 内才生效；而 `open`
被反射成宿主属性后读回为 `true`，关闭状态无法写回。

`check:admin` 不断言 Escape——把它记在这里，而不是换成一个更弱的断言假装通过。

### C-9（P1）对话框关闭后无法重新打开

关闭一次后，宿主的 `open` 属性残留，`data-state` 停在 `closed`，
`zw-dialog-content` 保持 `hidden`。读者关掉对话框就再也打不开它。

同一原因（属性反射与受控语义冲突），与 C-8 一并属于组件的状态管理缺陷。

### C-10（P1）组件生成的 JSX 类型缺 `ref` 与 `prop:`

`packages/web-c/component-dts/src/generateJsxDts.ts` 的 `commonProps` 只列了
`children`、`class`、`style`、`id`、`role`、`part`、`slot`，而 `ref` 是编译器
对所有元素都支持的绑定，`prop:name` 是写入非字符串属性（如 `columns` 数组）的
唯一方式。

后果是**正确代码无法通过 `tsc`**，且把 `prop:columns` 改成普通属性会让 DataGrid
渲染成空表（`aria-colcount="0"`）——本次实测撞到过。

**`ref` 已修**（同一个文件）：`commonProps` 增加
`ref: 'import("@zeus-js/runtime-dom").RefTarget<HTMLElement>'`。
`prop:` 尚未修，Admin 通过 `examples/admin/src/zw-jsx.ts` 里的 `withProp` 过渡。

### C-11（P2）`zw-dialog[data-state='closed'] { display: none }` 隐藏了触发器

Admin 的 `styles/base.css` 有一条针对旧版 API 的规则，把关闭状态的 dialog 整个
隐藏。真实组件的语义是只隐藏 content，trigger 必须始终可见。这条规则让"打开对话框"
按钮变成 0×0——本次实测中 `check:admin` 因此点不到它。

**已修**：规则改为只作用于 `zw-dialog-content[data-state='closed']`。

### C-12（P2）trigger 类元素自己渲染控件

`zw-dialog-trigger`、`zw-popover-trigger`、`zw-dropdown-menu-trigger`、
`zw-accordion-trigger`、`zw-tabs-trigger` 都自己渲染 `<button>`（tooltip 是
`<span>`）。在它们内部再放一个 `zw-button` 会产生按钮套按钮，内层不可点击。

这不是缺陷，是用法——但文档没写清楚，Gallery 的第一版就是这么写的。已在组件处
逐一改正，并在 `gallery.tsx` 的注释里记下。

## 8. 对 0.2.0 RC 的放行判断

R6-C 是"产品是否名实相符"的问题，不是可选打磨。在 Gallery 仍展示自建模拟件时，0.2.0 的组件库宣称没有证据支撑。

放行需要：Gallery 中不再有伪装的组件、`check:admin` 三浏览器通过、映射矩阵中的 NATIVE 项被显式标注。本 PR 覆盖前两项与第三项的标注；截图证据在合并前补齐。
