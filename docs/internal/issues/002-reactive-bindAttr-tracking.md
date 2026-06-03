# Issue: `defineElement` 内部 `bindAttr` reactive 依赖追踪断裂

## 症状

当在 `defineElement` 的 JSX 模板中对内层元素（如 `<button>`）使用动态属性时：

```tsx
defineElement('z-button', { shadow: false }, props => (
  <Host>
    <button
      disabled={Boolean(props.disabled)}
      aria-disabled={props.disabled ? 'true' : undefined}
    />
  </Host>
))
```

编译器正确生成：

```js
_bindAttr(_el$, 'disabled', () => Boolean(props.disabled))
_bindAttr(_el$, 'aria-disabled', () => (props.disabled ? 'true' : undefined))
```

但当外部设置 `element.disabled = true` 时，button 的 `disabled` / `aria-disabled` **不会更新**。

---

## 根因定位

通过调试确认：

1. `el.disabled = true` 触发 `element.propertyName = 'disabled'` setter
2. setter 调用 `_writePropFromProperty('disabled', true)` 写入内部 `state({})` 对象
3. **effect 的 getter 没有被重新调用** — reactive 依赖追踪断裂

具体证据：

```js
// toggle() 写入 checked
checked.value = next

// aria-checked binding 的 getter 永远只读了一次
// 后续 checked.value 变化时，getter 不再被调用
aria-checked={checked.value ? 'true' : 'false'}
```

`defineElement` 内部 reactive 系统的 owner/scope 边界与 effect 的追踪时机存在不匹配。

---

## 复现路径

所有 8 个失败的 headless 测试都是此问题：

| 测试文件            | 失败用例                                                     | 根因                                                                                                            |
| ------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `button.spec.tsx`   | `blocks press while disabled and reacts to external updates` | `button.disabled` 绑定到 `props.disabled`，但 `props.disabled` 变化不触发 getter                                |
| `checkbox.spec.tsx` | `toggles checked state...`                                   | `aria-checked` 绑定到 `props.checked`，但 `ctx.host.checked = next` 写入不在 reactive 链路                      |
| `switch.spec.tsx`   | 同上                                                         | 同上                                                                                                            |
| `tabs.spec.tsx`     | `clicking a trigger updates...`                              | `panel.hidden` 绑定到 `props.hidden`，context 写入选中状态不触发                                                |
| `dialog.spec.tsx`   | `opens from trigger...`                                      | `content.hidden` 绑定到 `open()`                                                                                |
| `icon.spec.tsx`     | `updates icon and label...`                                  | `aria-label` / `width` 绑定到 `props.label` / `props.size`，watch 监听 `props.name` 但初始化时 svg 为 undefined |

---

## 关键发现

### 1. `setAttr` 布尔属性处理是正确的

修复前：

```js
// setAttr(el, 'disabled', true)
// 会调用 el.setAttribute('disabled', 'true')
// JSDOM 里 el.disabled === false（因为是字符串 'true'）
```

修复后对布尔 DOM 属性用 property 赋值：

```js
if (isBooleanDomProperty(name) && el instanceof HTMLElement) {
  el[name] = value // button.disabled = true ✅
}
```

### 2. 编译器生成 `bindAttr` 是正确的

已验证快照，确认生成正确的 binding 调用。

### 3. 独立的 `bindAttr` 测试全部通过

`packages/core/runtime-dom/__tests__/bindings.spec.ts` 的所有测试通过，说明 `effect` / `setAttr` / `bindAttr` 本身工作正常。

### 4. 问题在 `defineElement` 的 owner/scope 集成

`setup` 函数通过 `runWithOwner(owner, () => withHostContext(...))` 执行，effect 被注册到 owner 的 scope。但 `props` 是通过 `definePropAccessors` 设置在 element 上的 proxy，`_writePropFromProperty` 写入了内部 state。effect 的 reactive 依赖追踪没有正确连接到 `_writePropFromProperty` 的触发链路。

---

## 涉及的改动（本次分支）

### 删除

- `examples/headless/src/shared/dom.ts` — 不再需要，runtime-dom 已有等效功能

### 新增

- `packages/core/runtime-dom/src/bindings.ts` — `setAttr` 对 `hidden`/`disabled`/`readonly` 等布尔 DOM 属性改用 property 赋值

### 重构

以下 8 个 headless 组件从 `ref + bindXxx()` 模式改为 JSX 直接声明式属性：

| 文件                        | 改动                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `button/button.tsx`         | 移除 `bindBooleanProp` / `bindOptionalAttr`，改 JSX 属性                                                          |
| `switch/switch.tsx`         | 同上                                                                                                              |
| `checkbox/checkbox.tsx`     | 同上，加入 `state()` 作为 checked 数据源                                                                          |
| `tabs/tab-trigger.tsx`      | 同上，加入 `state()`，`tabIndex` 改用 `prop:tabIndex={...}`                                                       |
| `tabs/tab-list.tsx`         | 移除 `bindOptionalAttr`，`aria-orientation` 直接 JSX 属性                                                         |
| `tabs/tab-panel.tsx`        | 移除 `bindBooleanProp`，`hidden` 直接 JSX 属性                                                                    |
| `dialog/dialog-content.tsx` | 同上                                                                                                              |
| `icon/icon.tsx`             | 移除 `bindOptionalAttr`，`width/height/aria-hidden/aria-label` 直接 JSX 属性，保留 `watch` 监听 `props.name` 变化 |

---

## 后续修复方向

### 方案 A：让 `_writePropFromProperty` 触发 effect 重跑（最小改动）

`_writePropFromProperty` 在写入 state 后，手动 trigger 对应的 reactive effect。这需要知道哪些 effect 依赖了这个 key。

```ts
_writePropFromProperty(key: string, value: unknown): void {
  const def = propDefs.find(item => item.key === key)
  ;(this.props as Record<string, unknown>)[key] = value

  // 手动触发所有读取过 props[key] 的 effect
  triggerReactiveEffects(this.props, key)
}
```

问题：需要访问 effect 的追踪信息，这可能需要修改 alien-signal 的内部 API。

### 方案 B：在 `defineElement` 里用 `watch` 监听 props 变化

```ts
setup(props) {
  for (const def of propDefs) {
    watch(
      () => (props as any)[def.key],
      (val) => { /* update DOM bindings */ },
    )
  }
}
```

问题：需要在 JSX 编译时生成这些 watch 调用，工作量较大。

### 方案 C：统一数据源 — 所有内部状态都用 local `state()`

让组件完全使用 local reactive state，外部 props 只用于初始化，外部更新通过 `attributeChangedCallback` 写入 state：

```ts
setup(props) {
  const checked = state(props.checked ?? false)

  // toggle 写 local state
  const toggle = () => {
    checked.value = !checked.value
  }

  // aria-checked 读 local state
  // <button aria-checked={checked.value ? 'true' : 'false'} />

  // attributeChangedCallback 同步外部变化到 local state
}
```

这需要 `attributeChangedCallback` 将属性变化写入 local state。

---

## 状态

- **发现时间**: 2026-06-03
- **影响范围**: 所有在 `defineElement` JSX 模板中对内层元素使用动态 aria-\* / boolean 属性的场景
- **优先级**: 高 — 影响 headless 组件的可访问性正确性
- **建议**: 方案 C 最稳健，符合 "单一数据源" 原则
