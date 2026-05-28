看完 `abeb4a8` 这次提交，整体结论：

**Context 这次修得比较对，之前最大的问题基本解决了；但事件 handler 的 optional member 还缺一层处理，另外文档和依赖变更建议拆一下。**

---

# 总体评价

这次 commit 做了几件关键事：

1. `createComponent` 改为 `runWithOwner`，owner 可以正确恢复。
2. `Provider` 内部也改为 `runWithOwner`，不再污染兄弟节点。
3. `Context` 增加 `hasDefaultValue`，支持 `createContext(undefined)`。
4. `inject` 使用 `arguments.length` 区分“没传 fallback”和“传了 undefined”。
5. `resolveDOMContext` 增加 `found`，可以区分“没找到”和“找到 undefined”。
6. compiler 删除了 `.Provider / .Bridge` 名字启发式判断，所有组件都统一走 `createComponent`。

这些方向都对。

---

# 这次做得好的点

## 1. Owner 泄漏问题基本修掉了

现在 `Provider` 是：

```ts
return runWithOwner(owner, () => {
  const children = resolveValue(props.children)
  // ...
  return children
})
```

这能保证 Provider 执行完后恢复 previous owner。

`createComponent` 也统一成：

```ts
const owner = createOwner()
return runWithOwner(owner, () => component(props))
```

这个比之前手动 `setCurrentOwner(owner.parent)` 安全。

测试也补了“嵌套 Provider 不污染后续兄弟节点”这个关键用例。

这个问题可以认为已解决。

---

## 2. `undefined` 语义修得对

现在 `createContext` 用 `arguments.length > 0` 判断是否显式传入 default。

`inject` 也用 `arguments.length >= 2` 判断是否显式传入 fallback。

对应测试也比较完整：

```ts
createContext<string | undefined>(undefined)
inject(Context, undefined)
```

都覆盖到了。

这块可以过。

---

## 3. Web Component bridge 修得对

`defineElement` 现在不再用 `value !== undefined` 判断 context 是否存在，而是用：

```ts
const resolved = resolveDOMContext(...)
if (resolved.found) {
  owner.provides.set(context.id, resolved.value)
}
```

这个可以支持 context value 本身就是 `undefined` 的情况。

示例里也修成了 `ThemeContext` 和 `UserContext` 都 bridge。

这块也可以过。

---

# 需要修的问题

## P1：`OptionalMemberExpression` 事件处理还不完整

这次新增了 `normalizeEventHandler`，普通 member expression 会被包成：

```ts
_event$ => theme.toggle(_event$)
```

对应测试也只覆盖了这个场景。

当前实现是：

```ts
if (!t.isMemberExpression(handler) && !t.isOptionalMemberExpression(handler)) {
  return handler
}

const event = context.uid('event$')

return t.arrowFunctionExpression(
  [t.identifier(event.name)],
  t.callExpression(t.cloneNode(handler), [t.identifier(event.name)]),
)
```

普通的 `theme.toggle` 没问题，因为生成 `theme.toggle(event)` 可以保留 `this = theme`。

但如果是：

```tsx
<button onClick={maybe?.toggle} />
```

当前可能生成类似：

```ts
_event$ => maybe?.toggle(_event$)
```

这个语义不完全等价于原始 handler value。原本 `maybe?.toggle` 如果是 `undefined`，runtime 可以不调用；但包装成函数后，点击时一定会执行 wrapper。如果 `maybe` 存在但 `toggle` 不存在，可能会抛错。

建议补一条测试：

```ts
it('preserves optional member event handler semantics', async () => {
  const code = `
    const App = () => {
      const maybe = state<{ toggle?: (e: Event) => void } | undefined>(undefined)
      return <button onClick={maybe?.toggle}>Toggle</button>
    }
  `

  const output = await compile(code)
  expect(output).toContain('?.')
})
```

更稳的实现方向是区分普通 member 和 optional member：

```ts
function normalizeEventHandler(
  handler: t.Expression,
  context: CompilerContext,
): t.Expression {
  if (t.isMemberExpression(handler)) {
    const event = context.uid('event$')

    return t.arrowFunctionExpression(
      [t.identifier(event.name)],
      t.callExpression(t.cloneNode(handler), [t.identifier(event.name)]),
    )
  }

  if (t.isOptionalMemberExpression(handler)) {
    const event = context.uid('event$')

    return t.arrowFunctionExpression(
      [t.identifier(event.name)],
      t.optionalCallExpression(
        t.cloneNode(handler),
        [t.identifier(event.name)],
        true,
      ),
    )
  }

  return handler
}
```

如果 `t.optionalCallExpression` 类型不顺，可以先不支持 optional member，直接保留原表达式：

```ts
if (t.isOptionalMemberExpression(handler)) {
  return handler
}
```

这样至少不会改变原始语义。

---

## P2：`context2.md` 像是直接把方案草稿提交进来了

新增的 `docs/internal/design/stage2/context2.md` 开头是“下面给一版可以直接作为下一次提交目标……”，更像聊天草稿，不像正式设计文档。

建议二选一：

```txt
1. 删除 context2.md，只保留代码和测试。
2. 或者重命名为 context-stabilization.md，并改成正式文档格式。
```

例如：

```txt
docs/internal/design/stage2/context-stabilization.md
```

标题建议改成：

```md
# Context Stabilization Design
```

不要保留“下面给一版”这种对话式文本。

---

## P2：依赖升级最好不要混在 context commit 里

这次 `package.json` 同时升级了：

```txt
@typescript/native-preview: 7.0.0-dev.20260527.2
rolldown: 1.0.3
```

这和 context / event 修复关系不大。建议单独拆成：

```txt
chore(deps): bump rolldown and typescript native preview
```

否则之后如果构建出问题，很难判断是 context 改动导致，还是 bundler / dts 工具升级导致。

---

## P2：没有看到 CI workflow run

我这边查 commit 关联 workflow runs，返回为空。

合并前建议本地至少跑：

```bash
pnpm check
pnpm test-unit
pnpm build
pnpm build-dts
pnpm examples:check
```

尤其是这次改了 `rolldown` 和 `@typescript/native-preview`，`build-dts` 必须跑。

---

# 建议结论

这次提交 **主体可以认可**，Context 语义比上一版明显稳定很多。

但我建议合并前再补一个小 commit：

```txt
fix(compiler): handle optional member event handlers safely
```

内容：

```txt
1. normalizeEventHandler 区分 MemberExpression 和 OptionalMemberExpression
2. 补 onClick={maybe?.toggle} 的 compiler 测试
3. 可选：清理/重命名 docs/internal/design/stage2/context2.md
4. 可选：把 rolldown/native-preview 升级拆成独立 chore
```

按优先级看：

```txt
必须修：
- optional member event handler 语义

建议修：
- context2.md 文档命名和内容
- 依赖升级拆 commit
- 跑完整 check/build/test
```

Context 本身这次已经进入比较健康的 MVP 状态了。
