# 首次 15 分钟

这份流程用于让第一次接触 Zeus 的用户，从空目录开始，完成一个经过检查和构建的组件，并验证 Web Component、React 和 Vue 输出。它刻意保持小范围，不要求构建生产应用。

## 操作步骤

1. 运行 `pnpm create zeus`，输入项目名称，选择 **Component Library TypeScript** 模板。
2. 先确认模板选对：组件库模板应包含 `src/components/greeting.tsx`、`src/index.ts` 和 `src/styles.css`。如果看到的是 `src/main.tsx` 和 `src/app.tsx`，说明选中了 **Application TypeScript**；如果只有 `src/main.tsx` 且页面使用 `<z-counter>`，说明选中了 **Web Component TypeScript**。这两个模板都不是本验收流程所需的组件库模板；请换一个新目录重新运行，不要对已有目录使用 `--force`。
3. 打开 `src/components/greeting.tsx`，修改问候文本，并保留已经声明的 `name` prop。
4. 依次运行 `pnpm check`、`pnpm build` 和 `pnpm test`。
5. 检查以下生成文件：`dist/wc/auto.js`、`dist/react/index.js`、`dist/vue/index.js`、`dist/custom-elements.json` 和 `dist/zeus.components.json`。
6. 在浏览器页面中引入 `dist/wc/auto.js`，渲染：

```html
<z-greeting name="World">Hello from a slot</z-greeting>
```

## 成功标准

- `check`、`build` 和 `test` 全部通过。
- 自定义元素成功显示问候文本。
- slot 投影内容可见。
- Web Component、React、Vue 和组件元数据文件均已生成。

不需要修改 Zeus 内部源码。

## 真人验收记录

请由首次接触 Zeus 的用户独立完成以上步骤，并记录：

- 开始和结束时间，以及总耗时；
- 每一步的耗时；
- 卡住的位置、提问和需要的帮助；
- 是否在 15 分钟内达到成功标准。

可以匿名记录，不需要收集个人信息。建议使用以下格式：

```text
日期：
用户代号：
总耗时：

步骤耗时：
1. 创建项目：
2. 修改 greeting.tsx：
3. check/build/test：
4. 检查 dist 输出：
5. 浏览器渲染自定义元素：

卡点或提问：
最终结果：成功 / 未成功
```

`pnpm check:quick-start` 会在临时项目中自动执行同一流程，并将测量结果写入 `temp/first-15-minutes/report.json`。它只能验证流程可运行，不能代替真人对首次理解程度和文档易用性的观察。
