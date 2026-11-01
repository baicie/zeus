# 跨仓契约修复 · Z-1 / Z-2 / Z-3 / Z-4 / Z-5 验收证据（2026-11-02）

Zeus UI 的 PR-24（跨宿主契约矩阵）实测到五条 zeus 仓契约问题，记录在
`zeus-ui/docs/internal/zeus-contract-proposals.md`。本表逐条给出处理方式与证据，提交 `2abc8a0`。

## 判定

| 编号 | 类型   | 处理     | 结论                                                                     |
| ---- | ------ | -------- | ------------------------------------------------------------------------ |
| Z-1  | 编译器 | 已修复   | `prop:` 名字含 `-` 报 `ZEUS_INVALID_PROP_NAME`，hint 给出 camelCase 写法 |
| Z-2  | 编译器 | 已修复   | 自定义元素上 `onValueChange` 绑定 `value-change`；原生元素保持小写       |
| Z-3  | 文档   | 已记录   | `docs/advanced/performance.md` 写明委托只覆盖静态可枚举的事件名          |
| Z-4  | 运行时 | 已修复   | `bindProp` 记住自己写入的值，不读自定义元素 accessor，冗余赋值跳过       |
| Z-5  | 文档   | 已记录   | `docs/compiler-host/define-element.md` 新增 Readiness 契约               |
| Z-6  | 验收   | 无需改动 | 导入面已收敛（zeus-ui 侧 `check:zeus-imports` 通过），不需要 zeus 仓动作 |

## 复现与结果（实际执行的命令）

`transformModule` 探针（`target: 'dom'`，`delegateEvents: true`）：

| 输入                                     | 修复前产物                               | 修复后产物                                |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| `<z-grid prop:selection-mode={p.mode}/>` | `$zeusBindProp(el, "selection-mode", …)` | 诊断 `ZEUS_INVALID_PROP_NAME`，不产出代码 |
| `<z-grid onValueChange={p.fn}/>`         | `$zeusBindEvent(el, "valuechange", …)`   | `$zeusBindEvent(el, "value-change", …)`   |
| `<z-grid on:value-change={p.fn}/>`       | `$zeusBindEvent(el, "value-change", …)`  | 不变                                      |
| `<div onCustomThing={p.fn}/>`            | `$zeusBindEvent(el, "customthing", …)`   | 不变（原生元素规则未动）                  |

端到端（jsdom + 真实 runtime + 编译产物）：

```text
编译 <z-input value={…} onValueChange={…}/> → bindEvent(el, "value-change", …, false)
dispatchEvent(new CustomEvent("value-change", { detail: { value: "Grace" } }))
→ onValueChange received: Grace
```

Z-4 的红→绿：`bindings.spec.ts` 的新用例在修复前报 `expected 2 to be 1`（两次 setter 调用），
修复后单次写入且 getter 只被测试自身读取一次。

## 测试命令与结果

| 命令                                                                                                  | 结果                     |
| ----------------------------------------------------------------------------------------------------- | ------------------------ |
| `cargo test -p zeus_compiler --offline`                                                               | PASS，1+7+54+1+61 项     |
| `pnpm test:compiler-native`                                                                           | PASS，32/32              |
| `pnpm exec vitest run --project unit`                                                                 | PASS，169 文件 / 1884 项 |
| `pnpm exec vitest run --project unit packages/core/compiler packages/core/runtime-dom packages/web-c` | PASS，86 文件 / 1083 项  |
| `pnpm check`（tsc）                                                                                   | PASS                     |
| `pnpm lint`                                                                                           | PASS                     |
| `pnpm format-check`                                                                                   | PASS                     |
| `pnpm check:docs`                                                                                     | PASS                     |
| `pnpm check:cjs`                                                                                      | PASS，21 包 / 30 导出    |
| `pnpm api:check`                                                                                      | PASS，快照无差异         |
| `pnpm check:runtime-interop`                                                                          | PASS                     |
| `pnpm check:ssr-safe-import`                                                                          | PASS                     |

## 已知边界

- `cargo fmt -p zeus_compiler --check` 在 `codegen.rs`、`html.rs`、`tests/transform.rs` 仍有 6 处
  差异，`cargo clippy -D warnings` 在 `codegen.rs:608`、`html.rs:148/150`、`ssr.rs:153` 有 4 处报错。
  这些文件本切片未修改，差异在 `HEAD` 上已存在，不计入本次改动。
- 自定义元素的 camel→kebab 只处理 ASCII 大写字母；`on:name` 仍是任意名字的逃生口。
- 浏览器三引擎未跑：本机不能监听端口，且未安装 Playwright 浏览器。
