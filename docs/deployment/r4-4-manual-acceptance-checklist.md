# Zeus 0.2.0 R4.4 人工验收清单

日期：2026-11-07  
状态：**NOT_RUN**（本轮未执行任何人工辅助技术或人工审批）。  
要求：每项记录执行人、日期、OS/浏览器/AT 版本、截图或录屏、结果；未执行的
项目必须保持 `NOT_RUN`，不得用自动测试替代。

## 1. VoiceOver + Safari（macOS）

- [ ] Playground 首屏：标题、编辑器、运行/停止、示例选择器、Console/Problems
- [ ] 编译 Native 示例，焦点移动到预览 iframe 后仍可操作 counter
- [ ] WebC 示例：manifest、Inspector、DevTools 面板可读
- [ ] 错误注入后 Problems 列表可定位到编辑器
- [ ] 分享/导出对话框焦点陷阱与 Esc 关闭
- [ ] Admin 登录、用户列表、筛选、分页、编辑、删除确认
- [ ] Admin 会话过期/退出后的焦点与提示
- [ ] AI Workbench：只读横幅、composer 禁用、消息时间线、SSE 新消息播报
- [ ] AI 审批 Dialog：标题、风险、批准/拒绝、焦点返回
- [ ] DataGrid：表头排序、行选择、空状态、分页
- [ ] Shadow DOM 组件：焦点顺序、slot 内容可读

## 2. NVDA + Chrome

- [ ] Playground 全流程（同第 1 节）
- [ ] Admin 全流程；CSRF/权限错误的 live region 提示
- [ ] AI Workbench SSE：新 assistant 消息自动播报且不重复
- [ ] 审批 Dialog 与撤销
- [ ] DataGrid 键盘导航与列排序播报

## 3. NVDA + Firefox

- [ ] Playground Native/WebC 编译与预览
- [ ] Admin 登录、用户 CRUD、退出
- [ ] AI Workbench 只读状态与消息时间线
- [ ] 表单错误、Dialog、Toast 的可读性

## 4. 键盘与焦点

- [ ] 仅 Tab/Shift+Tab 可到达所有交互控件
- [ ] Playground 编辑器、示例选择器、Run/Stop、Problems、Console、分享、导出
- [ ] Admin 登录、表格、分页、Dialog、确认删除
- [ ] AI composer 禁用时不可聚焦；只读横幅可读
- [ ] 所有 Dialog 焦点陷阱、Esc、关闭后焦点返回触发元素
- [ ] 无键盘陷阱；Skip link（如有）可用

## 5. 200% Zoom

- [ ] Playground 390/768/1024/1440 宽度下无横向滚动（编辑器/Tab 区除外）
- [ ] Admin 表格在 200% 下可横向滚动且首列/操作列可达
- [ ] AI Workbench 三栏在 200% 下折叠/滚动正确
- [ ] 文案不截断关键操作；按钮不重叠

## 6. DataGrid

- [ ] 排序、筛选、分页、选择、空状态
- [ ] 200% Zoom + 键盘
- [ ] Shadow DOM 与 light DOM 两种模式
- [ ] 大数据量滚动性能可接受

## 7. Shadow DOM

- [ ] `defineElement({shadow:true})` 的 slot 投影
- [ ] `defineElement({shadow:false})` 的 Zeus 投影
- [ ] 属性/attribute 反射与类型转换
- [ ] 断开连接后的 effect/cleanup 无泄漏

## 8. AI SSE / 审批

- [ ] 只读 public replay：无发送、无审批、无上传入口
- [ ] 同一访客刷新后 preset 消息仍可读，且不含历史访客消息
- [ ] SSE 断线重连从 Last-Event-ID 续传，不重复播报
- [ ] 本地 demo 模式：发送、propose、approve、reject 全流程
- [ ] 审批拒绝/过期/撤销的提示可读
- [ ] 浏览器控制台无未处理异常

## 9. 移动端

- [ ] Playground 390×844：编辑器、预览、Console/Problems Tab 可切换
- [ ] Admin 390×844：登录、用户列表、分页、Dialog
- [ ] AI Workbench 390×844：只读横幅、消息时间线、无 composer
- [ ] 触摸目标 ≥ 44×44 CSS px
- [ ] 横竖屏切换不丢状态

## 10. 发布审批

- [ ] Core RC 版本与发布顺序批准
- [ ] UI RC 对齐与发布批准
- [ ] 四产品在线验收证据复核
- [ ] 安全负责人复核 AI public replay / Admin credential / SSH 凭据事件
- [ ] npm publish、dist-tag、Tag、GitHub Release 分别授权

## 结果记录

| 项目               | 执行人 | 日期 | 环境 | 结果    | 证据 |
| ------------------ | ------ | ---- | ---- | ------- | ---- |
| VoiceOver + Safari |        |      |      | NOT_RUN |      |
| NVDA + Chrome      |        |      |      | NOT_RUN |      |
| NVDA + Firefox     |        |      |      | NOT_RUN |      |
| 键盘/焦点          |        |      |      | NOT_RUN |      |
| 200% Zoom          |        |      |      | NOT_RUN |      |
| DataGrid           |        |      |      | NOT_RUN |      |
| Shadow DOM         |        |      |      | NOT_RUN |      |
| AI SSE/审批        |        |      |      | NOT_RUN |      |
| 移动端             |        |      |      | NOT_RUN |      |
| 联合发布审批       |        |      |      | NOT_RUN |      |
