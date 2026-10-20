# RFC-017：可证明安全的 HMR 状态保留

状态：Accepted（2026-10-19）

## 范围

Zeus 的 Vite 插件只为已经证明不会改变可执行模块的编辑保留现有 root、owner 和 DOM
identity。当前唯一启用的类别是 `comment-only`：只归一化普通注释正文，新旧模块的其它源码、
注释内的行终止符和编译指令逐字相同。块注释里的换行参与 JavaScript 自动插入分号，不能删除。
单行注释以 LF、CR、U+2028 或 U+2029 结束，后面的源码继续按可执行内容比较。

`@once`、JSX pragma、PURE annotation、Vite/Webpack/Rollup directive 与 source map 指令等
注释保留原文；增加、删除或修改这些指令会触发重新编译，使新的诊断或生成结果可见。

以下编辑始终执行 `dispose-remount`：JSX 文本或结构、字符串和正则字面量、Signal 初始化、
组件 API、绑定表达式、导入导出以及无法解析的语法变化。纯 CSS 文件继续交给 Vite CSS HMR。

分类器通过 `@babel/parser` 的 TS/JSX 解析结果定位真实注释，只归一化这些范围。模板字符串、
嵌套 JSX 文本、正则和字符串中的注释形状保持原文。解析失败或不支持的语法保守执行
`dispose-remount`，让 Vite 重新编译并报告诊断；这里的解析仅用于 HMR，不参与 Zeus IR/codegen。

## 不变量

保留路径不得执行新模块代码，不得创建第二个 root，不得替换现有 DOM，不得改变 listener 或
binding identity。分类器返回 `preserveState: true` 时，Vite `handleHotUpdate` 返回空模块列表；
否则必须先完成 runtime disposer，再让 Vite 重新加载模块。异常分类和异常编译都走完整销毁，避免
遗留 owner、effect 或 listener。

## 证据

`packages/devtools/vite-plugin/__tests__/hmr.spec.ts` 和 `transform.spec.ts` 覆盖注释保留、
JSX/字符串/正则/Signal/API 变化的 remount、异常 disposer 和 SSR/production 边界。后续若要
保留绑定更新，必须另提 RFC，证明 owner、事件监听、binding identity 和源映射兼容后才能扩大
分类器范围。

块注释 ASI 回归直接执行新旧 JavaScript，证明 `return /* ... */ value` 增加注释内换行后返回值
改变；另有 Unicode 单行注释终止、编译指令双向修改，以及 Vite 重新编译 `@once` 后报告迁移
诊断的集成测试。
