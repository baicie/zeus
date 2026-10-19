# RFC-017：可证明安全的 HMR 状态保留

状态：Accepted（2026-10-19）

## 范围

Zeus 的 Vite 插件只为已经证明不会改变可执行模块的编辑保留现有 root、owner 和 DOM
identity。当前唯一启用的类别是 `comment-only`：去掉注释后新旧模块的可执行源码逐字相同。

以下编辑始终执行 `dispose-remount`：JSX 文本或结构、字符串和正则字面量、Signal 初始化、
组件 API、绑定表达式、导入导出以及无法解析的语法变化。纯 CSS 文件继续交给 Vite CSS HMR。

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
