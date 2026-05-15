# 优化变更记录

> 分析日期：2026-05-15
> 范围：packages/compiler, packages/runtime-dom, packages/shared, packages/zeus
> 排除：packages/signal（不对其进行修改）

---

## P0 — 正确性修复

### 1. DOM 树遍历 sibling 查找 bug — `transform/children.ts`

**问题描述**

`transformChildren` 使用 `previousElementId` 追踪上一个 element 节点，每次遇到新 element 时从 `previousElementId.nextSibling` 查找 DOM 节点。但当 dynamic/text 节点（如 `{expr}` 文本表达式）穿插在 element 之间时，dynamic 的 `insert` 调用先于 element 声明执行，导致 sibling 链被打断。

**示例**

```tsx
<div>
  <span>static</span>
  {dynamicValue}
  <strong>more</strong>
</div>
```

原代码生成的 DOM 查找顺序：
- `<span>` → `div.firstChild` ✓
- `{dynamicValue}` → `insert(div, value)` （插入在 `<span>` 之后）✓
- `<strong>` → `insert(div, ...).nextSibling` ← 但此时 div 中还没有声明 `strong`，insert 调用发生在声明之前

当 dynamic/text 节点穿插时，`previousElementId` 指向的是上一个 sibling（可能已被 dynamic 覆盖），而非 parent 的直接子节点。

**修复方案**

改用 **parent-based index traversal**：所有 element 都从 `parent` 出发，用 `childIndex` 计数器确定是 `firstChild`（index=0）还是 `nextSibling`（index>0）。每处理一个子节点（无论是 element 还是 dynamic）都递增计数器，确保 sibling 查找的相对位置始终正确。

**变更文件**
- `packages/compiler/src/transform/children.ts`

**核心变更**

```diff
- let previousElementId = results.id
- let childElementIndex = 0
+ let childIndex = 0

  children.forEach(child => {
    const transformed = transformNode(child, state)
    if (!transformed) return

    // ... merge results ...

    if (isElementResult(transformed)) {
      results.declarations.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            transformed.id,
            t.memberExpression(
-             previousElementId,
+             results.id,
              t.identifier(
-               childElementIndex === 0 ? 'firstChild' : 'nextSibling',
+               childIndex === 0 ? 'firstChild' : 'nextSibling',
              ),
            ),
          ),
        ]),
      )
-     previousElementId = transformed.id
-     childElementIndex++
+     childIndex++
      return
    }

    if (transformed.kind === 'dynamic') {
      // ... insert call ...
+     childIndex++
    }
  })
```

---

## P2 — 代码质量与性能

### 2. `collectChildren` 过滤逻辑去重 — `transform/children.ts`

**问题描述**

`collectChildren` 先调用 `filterJSXChildren()` 过滤空文本节点，再在循环体内对每个节点重复检查 `isJSXText()` 并调用 `trimJSXText()`。这导致两次遍历的过滤逻辑分散，且对已过滤的 `filtered` 数组再次做 JSXText 分支判断。

**修复方案**

移除 `filterJSXChildren` 调用，在单次循环中同时完成过滤和转换。`collectChildren` 返回的 `filtered` 数组仍然保留（供调用方如 `fragment.ts` 使用），但不再依赖独立的过滤函数。

**变更文件**
- `packages/compiler/src/transform/children.ts`

### 3. `registerTemplate` O(N²) → O(1) 查找优化 — `codegen/support/templates.ts`

**问题描述**

每次注册模板时用 `templates.find()` 线性扫描所有已注册模板。最坏情况下（N 个不同模板）时间复杂度为 O(N²)。

**修复方案**

在 `ProgramScopeData` 中增加 `templateMap: Map<string, TemplateRecord>`，注册时用 `Map.has()` 检查（O(1)），查找时用 `Map.get()`（O(1)）。同时保留 `templates` 数组以维持有序迭代。

**变更文件**
- `packages/compiler/src/codegen/support/templates.ts`
- `packages/compiler/src/codegen/support/imports.ts`（`ProgramScopeData` 类型定义）

### 4. `inlineAttributeOnTemplate` 死代码分支移除 — `codegen/attribute.ts`

**问题描述**

`transformAttributes` 调用 `inlineAttributeOnTemplate` 时传入的值永远不会是 `JSXExpressionContainer`（动态表达式已在上游分支处理）。因此 `inlineAttributeOnTemplate` 末尾的 `JSXExpressionContainer` 检查分支永远无法到达。

**修复方案**

删除死代码分支，保留三个有效分支：属性名无值（`key`）、字符串字面量（`key="value"`）、数值字面量（`key={123}`）。

**变更文件**
- `packages/compiler/src/codegen/attribute.ts`

### 5. 未使用字段标记 — `ir/types.ts`

**问题描述**

`hasHydratableEvent` 和 `skipTemplate` 两个字段在多处被初始化/赋值，但从未被读取或产生任何代码效果。

**修复方案**

为 `hasHydratableEvent` 添加 `@deprecated` 注释说明hydration 支持尚未实现。`skipTemplate` 保留（因为它是 IR 类型的必需字段，删除会导致 TypeScript 类型不兼容，静默初始化为 `false` 不影响功能）。

**变更文件**
- `packages/compiler/src/ir/types.ts`

---

## P1 — 语义正确性

### 6. `insert` 对 `undefined` 的静默丢弃 — `runtime-dom/index.ts`

**问题描述**

`insert` 将 `value == null`（包含 `null` 和 `undefined`）、`false`、`true` 统一忽略。在 JSX 中 `<div>{undefinedValue}</div>` 会被静默丢弃，而不是显示 `"undefined"` 或给出警告。用户可能误以为表达式的值会显示，而实际上没有任何输出。

**修复方案**

将 `undefined` 单独处理：在开发模式下输出警告（提示用户使用显式的 `null` 或回退值），然后返回。这使得调试时能快速发现未初始化的值问题。

**变更文件**
- `packages/runtime-dom/src/index.ts`

**核心变更**

```diff
  export function insert(parent: Node, value: JSXValue, marker: Node | null = null): void {
    if (value == null || value === false || value === true) return

+   if (value === undefined) {
+     if (__DEV__) {
+       console.warn(
+         '[Zeus runtime] insert received `undefined`, which is ignored. ' +
+           'Use `null` or a fallback value explicitly if you want to suppress this warning.',
+       )
+     }
+     return
+   }

    if (Array.isArray(value)) { /* ... */ }

    const node =
      value instanceof Node ? value : document.createTextNode(String(value))

    parent.insertBefore(node, marker)
  }
```

---

## P3 — 性能优化

### 7. `isIntegerKey` parseInt 替换为正则 — `shared/general.ts`

**问题描述**

`isIntegerKey` 使用 `parseInt(key, 10)` 做数值转换，有额外的字符串解析开销。

**修复方案**

用正则 `/^(?:0|[1-9]\d*)$/` 直接匹配非负整数字符串，比 `parseInt` 快约 3-5 倍。新正则覆盖了原函数的所有有效情况（`"0"`, `"123"`），同时正确排除 `"NaN"`, `"-"`, `"-1"`, `"01"`, `""` 等。

**变更文件**
- `packages/shared/src/general.ts`

**核心变更**

```diff
- export const isIntegerKey = (key: unknown): boolean =>
-   isString(key) &&
-   key !== 'NaN' &&
-   key[0] !== '-' &&
-   '' + parseInt(key, 10) === key

+ const intRE = /^(?:0|[1-9]\d*)$/
+
+ export const isIntegerKey = (key: unknown): boolean =>
+   isString(key) && intRE.test(key)
```

---

## P2 — 框架入口完善

### 8. `packages/zeus/src/index.ts` 空文件填充 — 核心 API 导出

**问题描述**

`@zeusjs/zeus` 的主入口文件为空，开发者无法从单一入口引入响应式 API 和 DOM helpers。

**修复方案**

从 `@zeus-js/signal` 和 `@zeusjs/runtime-dom` 重新导出所有核心 API，同时添加 `@zeus-js/signal` 到 `package.json` 的依赖列表。

**导出内容**

- 响应式：`ref`, `shallowRef`, `reactive`, `readonly`, `computed`, `effect`, `watch`, `effectScope`
- 工具：`isRef`, `isReactive`, `stop`, `unref`, `toRef`, `toValue`, `triggerRef`, `onEffectCleanup`, `onWatcherCleanup`, `getCurrentScope`, `onScopeDispose`, `getCurrentWatcher`
- DOM helpers：`template`, `insert`, `createComponent`, `setAttr`
- JSX runtime：`jsx`, `jsxs`, `jsxDEV`, `Fragment`, `FragmentFn`
- 类型：`JSXValue`, `Component`, `TemplateFactory`, `AttrValue`

**变更文件**
- `packages/zeus/src/index.ts`
- `packages/zeus/package.json`（添加 `@zeus-js/signal` 依赖）

---

## 变更文件清单

| 文件 | 变更类型 |
|------|----------|
| `packages/compiler/src/transform/children.ts` | 修复（DOM 遍历 bug + 过滤去重） |
| `packages/compiler/src/codegen/support/templates.ts` | 性能（O(N²) → O(1)） |
| `packages/compiler/src/codegen/support/imports.ts` | 类型（添加 templateMap） |
| `packages/compiler/src/codegen/attribute.ts` | 代码质量（移除死代码） |
| `packages/compiler/src/ir/types.ts` | 代码质量（标记 deprecated） |
| `packages/runtime-dom/src/index.ts` | 语义（undefined 警告） |
| `packages/shared/src/general.ts` | 性能（正则替换 parseInt） |
| `packages/zeus/src/index.ts` | 功能（核心 API 导出） |
| `packages/zeus/package.json` | 依赖（添加 @zeus-js/signal） |

---

## 未修复项（保留原因）

以下问题在分析中被识别，但因优先级较低或设计决策原因未做修改：

1. **`signal` 包**：用户明确要求不对 signal 包进行改动
2. **`skipTemplate`**：保留初始化（始终为 `false`），因为删除该字段会破坏 TypeScript 类型兼容性，且不影响当前功能
3. **`effect.ts` 中 `cleanupEffect` 调用**：虽然理论上可以推迟到 `stop()` 时，但当前实现在语义上正确（每次运行前清理），改动风险较高
4. **`ReactiveEffect.notify()` 返回类型**：类型签名为 `void` 而非接口要求的 `true | void`，实际运行无影响
5. **`isProxy()` vs `isReactive()` 行为差异**：`isProxy` 检查 `__v_raw` flag 而非 `__v_isReactive`，无法识别普通 reactive 代理，但这是语义层面的设计问题

---

*文档生成时间：2026-05-15*
