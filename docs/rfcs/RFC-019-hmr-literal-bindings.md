# RFC-019：编译器签名驱动的 HMR 字符串绑定 patch

状态：Experimental（2026-11-03）。扩展 RFC-017；Vite 显式配置
`hmr: { preserveBindings: true }` 才启用 patch，默认行为保持 RFC-017 的边界。

## 编译器契约

Rust 从同一 Zeus IR 识别 Native DOM 中非 `once` 的纯字符串文本表达式，以及
`class` / `style` 的纯字符串表达式。例：`<p class={'muted'}>{'Hello'}</p>`。
字符串必须由 Oxc 解析为 StringLiteral，不接受任意函数、模板表达式或对象；
不处理 spread、自定义元素、Host/Slot、raw-text 元素、DOM property、事件和 ref。

有自动 render root 且没有手工 `import.meta.hot` 的 DOM 模块才提供 `hmrPlan`。
计划包含版本、稳定 IR binding ID、类型和值。结构签名由整个模块源码生成，只将
这些已识别表达式范围以外的源码分段与 binding ID/类型一起做结构化比较；其余每个字节都参与比较，
包括导入、导出、组件边界、控制流、Signal 初始化、事件闭包、effect 顺序和模块副作用。
相同签名是本实验子集的充分条件；不能据此推断任意语义等价编辑。

codegen 仅将这些表达式改成内部 HMR cell 的读取，仍使用既有 DOM binding/effect。
cell 由同一 Zeus signal engine 创建。SSR 与 production 不生成计划和 cell；
无需在 TypeScript 侧另建 JSX lowering 或复用新模块的闭包。

## 更新协议和失败处理

Vite 先编译新源码，只有无错误且旧新计划签名、binding schema 完全一致时，发送
`zeus:hmr-patch` 数据消息并返回空更新模块列表。消息含 filename、签名、旧值与新值。
浏览器验证当前值与旧值一致后，batch 更新既有 cell。重复消息幂等；漏消息、乱序或
计划不匹配需要 invalidate，让 Vite 恢复完整加载。禁止执行新模块代码、替换节点或
创建第二套 root、effect、listener。

更新抛错时恢复旧 cell 值，随后 invalidate；回滚失败也必须 invalidate 并给出诊断。
DOM binding 的 HMR 写入失败直接返回 patch 事务，由它回滚；不调用应用 ErrorBoundary
替换子树。普通运行时错误的异常处理规则保持原契约。
编译失败保持最后成功的计划、现有 DOM 和状态，正常显示 Vite overlay；修复后按
最后成功状态重新分类。dispose 移除自定义消息监听，并释放 cell 表；cell 不引用 DOM。

签名不匹配或没有计划时执行 RFC-017 的 dispose-remount。纯 CSS 继续由 Vite 管理。
注释保留独立成立；同时修改其它非 literal 源码的编辑允许保守 remount。

## 必需证据

- Rust 比较旧新计划：literal text/class/style 值变更签名一致；导入、初始化、事件、
  结构、once、spread、Host/Slot、自定义元素和 raw-text 改动不可据此 patch。
- Native/WASM 计划与 codegen 一致；源码映射仍落在原表达式。
- runtime 测试证明多 root/条件/列表的现存绑定与以后挂载绑定使用同一 cell，旧子树
  cleanup 后不再更新；无新增 listener/owner，异常恢复和乱序都可验证。
- 真实 Vite 8 的 Chromium/Firefox/WebKit：输入、selection、focus、scroll、Dialog、
  列表增删、对象状态和 DOM identity；连续安全更新、结构变化 remount、编译报错与恢复。

这不是函数/组件热替换；尚未证明的表达式和编辑类别继续 remount。此内部计划与
runtime helper 作为 compiler/runtime 同版本契约，不新增公开 signal primitive。
