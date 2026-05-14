# transformJSX 三步核心流程解析

> 本文档分析 dom-expressions `transformJSX` 函数中 37-51 行的三个核心步骤，并给出在 `packages/compiler` 中的最小可移植实现。

---

## 1. 三步分解

### Step 1: 获取模板工厂函数

```js
const template = getCreateTemplate(config, path, result);
```

根据编译配置和节点类型，选择对应的模板生成函数：

| 判断条件 | 返回值 | 说明 |
|---|---|---|
| `result.tagName && result.renderer === "dom"` 或 `config.generate === "dom"` | `createTemplateDOM` | DOM 运行时模板 |
| `result.renderer === "ssr"` 或 `config.generate === "ssr"` | `createTemplateSSR` | SSR 模板 |
| 其余情况 | `createTemplateUniversal` | 通用模板 |

`result` 是 `transformNode` 的返回值，包含了从 JSX 节点提取出来的所有信息：

- `template` — HTML 静态模板字符串（如 `<div class="btn">count: </div>`）
- `templateWithClosingTags` — 保留完整闭合标签的模板
- `declarations` — 需要声明的变量（如模板变量 `tmpl$`）
- `exprs` — 表达式语句（动态绑定的 setter）
- `dynamics` — 动态属性变更
- `postExprs` — 后置表达式
- `tagName` — 元素标签名（用于区分 DOM 元素和组件）
- `renderer` — 渲染器类型

`template` 函数签名：

```ts
createTemplate(path: BabelPath, result: TransformResults, wrap: boolean) => BabelNode
```

- `path` — JSX 节点的 Babel Path，用于访问 scope、生成 uid 等
- `result` — 转换结果
- `wrap` — 是否用 memo 包装（顶层为 `false`）

---

### Step 2: 替换 JSX 节点

```js
path.replaceWith(replace(template(path, result, false)));
```

这里发生了关键的事：

1. **调用模板工厂** — `template(path, result, false)` 生成最终的 Babel AST 节点
2. **替换原 JSX 节点** — `path.replaceWith(...)` 将 JSX 替换为编译后的代码

最终产物示例：

```tsx
// 输入
<button class="btn" onClick={handler}>count: {count()}</button>

// 输出（DOM 渲染模式）
const _tmpl = template(`<button class="btn">count: </button>`);
() => {
  const _el$ = _tmpl();
  _el$.addEventListener("click", handler);
  _effect(() => setText(_el$, count()));
  return _el$;
};
```

---

### Step 3: 清理静态标记注释

```js
path.traverse({
  enter(path) {
    if (
      path.node.leadingComments &&
      path.node.leadingComments[0] &&
      path.node.leadingComments[0].value.trim() === config.staticMarker
    ) {
      path.node.leadingComments.shift();
    }
  }
});
```

遍历整棵 AST，找到所有以 `config.staticMarker`（默认为 `@once`）开头的行首注释，将其从 AST 节点上移除。

`@once` 注释用于标记不需要响应式包装的表达式：

```tsx
<div>{/* @once */ data()}</div>
```

在转换过程中，`@once` 的表达式不会被 `effect` 包装。转换完成后，这个标记本身已经没有意义，因此需要从最终输出的代码中清理掉，避免污染用户代码。

---

## 2. 流程总览

```
JSXElement / JSXFragment
       │
       ▼
transformNode(path, state)          // 遍历 JSX 树，提取模板 + 动态表达式
       │
       ├── template 字符串（静态 HTML）
       ├── declarations（模板变量声明）
       ├── exprs（箭头函数包装的动态表达式）
       ├── dynamics（effect 包装的属性更新）
       └── postExprs（后置表达式）
       │
       ▼
getCreateTemplate(config, path, result)   // 根据 renderer 选择模板工厂
       │
       ▼
createTemplateDOM / SSR / Universal         // 生成 Babel AST 节点
       │
       ▼
path.replaceWith(...)                       // JSX → 编译后代码
       │
       ▼
traverse(清除 @once 注释)                  // 清理静态标记
```

---

## 3. Zeus packages/compiler 中的最小实现

### 3.1 当前状态

Zeus 的 `packages/compiler` 已实现：

| 模块 | 状态 | 说明 |
|---|---|---|
| `transformText` | ✅ 已实现 | 返回 `{ kind: 'text', template, ... }` |
| `transformNode` | ✅ 入口 | 分发到各 transform |
| `transformElement` | ⚠️ 框架存在 | 逻辑未完成 |
| `createTemplate` | ❌ 未实现 | 模板生成核心 |
| `registerTemplate` + `appendTemplates` | ❌ 未实现 | 模板收集到 Program |
| `wrapDynamics` | ❌ 未实现 | 动态属性包装 |
| `@once` 清理 | ❌ 未实现 | 可后续按需实现 |

### 3.2 实现 `createTemplate`

在 `packages/compiler/src/transform/` 下新建 `createTemplate.ts`：

```ts
import * as t from '@babel/types'
import { registerImport } from '../utils/helpers'
import { getConfig } from '../utils/config'
import { setAttr } from './transformAttributes'
import type { TransformResults, BabelJSXPath } from '../utils/types'

export function createTemplate(path: BabelJSXPath, result: TransformResults, wrap: boolean) {
  const config = getConfig(path)

  if (result.id) {
    registerTemplate(path, result)
    if (
      !(result.exprs.length || result.dynamics.length || result.postExprs.length) &&
      result.declarations.length === 1
    ) {
      return result.declarations[0].init
    } else {
      return t.callExpression(
        t.arrowFunctionExpression(
          [],
          t.blockStatement([
            ...result.declarations,
            ...result.exprs,
            ...(wrapDynamics(path, result.dynamics) || []),
            ...(result.postExprs || []),
            t.returnStatement(result.id),
          ]),
        ),
        [],
      )
    }
  }

  if (wrap && result.dynamic && config.memoWrapper) {
    return t.callExpression(registerImport(path, config.memoWrapper), [result.exprs[0]])
  }

  return result.exprs[0]
}

function registerTemplate(path: BabelJSXPath, results: TransformResults) {
  const { hydratable } = getConfig(path)

  if (!results.template.length) return

  let templateId: t.Identifier

  const templates =
    path.scope.getProgramParent().data.templates ||
    (path.scope.getProgramParent().data.templates = [])

  const existing = templates.find(t => t.template === results.template)
  if (existing) {
    templateId = existing.id
  } else {
    templateId = path.scope.generateUidIdentifier('tmpl$')
    templates.push({
      id: templateId,
      template: results.template,
      templateWithClosingTags: results.templateWithClosingTags,
      isSVG: results.isSVG,
      isCE: results.hasCustomElement,
      isImportNode: results.isImportNode,
      renderer: results.renderer,
    })
  }

  const decl = t.variableDeclarator(
    results.id,
    hydratable
      ? t.callExpression(registerImport(path, 'getNextElement'), templateId ? [templateId] : [])
      : t.callExpression(templateId, []),
  )

  results.declarations.unshift(t.variableDeclaration('var', [decl]))
  results.decl = t.variableDeclaration('var', results.declarations)
}

function wrapDynamics(path: BabelJSXPath, dynamics: any[]) {
  if (!dynamics.length) return
  const config = getConfig(path)
  const effectWrapperId = registerImport(path, config.effectWrapper)

  if (dynamics.length === 1) {
    const d = dynamics[0]
    return t.expressionStatement(
      t.callExpression(effectWrapperId, [
        t.arrowFunctionExpression(
          [],
          setAttr(path, d.elem, d.key, d.value, {
            isSVG: d.isSVG,
            isCE: d.isCE,
            tagName: d.tagName,
            dynamic: true,
          }),
        ),
      ]),
    )
  }

  const prevId = path.scope.generateUidIdentifier('_p$')
  const declarations: t.VariableDeclarator[] = []
  const statements: t.Statement[] = []
  const properties: t.Identifier[] = []

  dynamics.forEach((d, index) => {
    const varIdent = path.scope.generateUidIdentifier('v$')
    const propIdent = t.identifier(`_${index}`)
    const propMember = t.memberExpression(prevId, propIdent)

    declarations.push(t.variableDeclarator(varIdent, d.value))
    properties.push(propIdent)

    statements.push(
      t.expressionStatement(
        t.logicalExpression(
          '&&',
          t.binaryExpression('!==', varIdent, propMember),
          setAttr(path, d.elem, d.key, t.assignmentExpression('=', propMember, varIdent), {
            isSVG: d.isSVG,
            isCE: d.isCE,
            tagName: d.tagName,
            dynamic: true,
            prevId: propMember,
          }),
        ),
      ),
    )
  })

  return t.expressionStatement(
    t.callExpression(effectWrapperId, [
      t.arrowFunctionExpression(
        [prevId],
        t.blockStatement([
          t.variableDeclaration('var', declarations),
          ...statements,
          t.returnStatement(prevId),
        ]),
      ),
      t.objectExpression(properties.map(id => t.objectProperty(id, t.identifier('undefined')))),
    ]),
  )
}

export function appendTemplates(path: BabelProgramPath) {
  const templates = path.scope.getProgramParent().data.templates || []
  if (!templates.length) return

  const declarators = templates.map(template => {
    const tmpl = {
      cooked: template.template,
      raw: escapeStringForTemplate(template.template),
    }

    const shouldUseImportNode = template.isCE || template.isImportNode
    const isMathML = /^<(math|annotation|annotation-xml|...)/.test(template.template)

    return t.variableDeclarator(
      template.id,
      t.addComment(
        t.callExpression(
          registerImport(path, 'template', getRendererConfig(path, 'dom').moduleName),
          [t.templateLiteral([t.templateElement(tmpl, true)], [])].concat(
            template.isSVG || shouldUseImportNode || isMathML
              ? [
                  t.booleanLiteral(!!shouldUseImportNode),
                  t.booleanLiteral(template.isSVG),
                  t.booleanLiteral(isMathML),
                ]
              : [],
          ),
        ),
        'leading',
        '#__PURE__',
      ),
    )
  })

  path.node.body.unshift(t.variableDeclaration('var', declarators))
}
```

### 3.3 更新 `transform/index.ts`

```ts
import { transformNode } from './transformNode'
import { createTemplate } from './createTemplate'
import type { BabelJSXPath, BabelState } from '../utils/types'

export function transformJSX(path: BabelJSXPath, state: BabelState) {
  if (state.get('skip')) return

  const result = transformNode(path, state)
  if (!result) return

  const template = createTemplate(path, result, false)
  path.replaceWith(template)
}
```

### 3.4 实现 `appendTemplates`

在 `packages/compiler/src/program.ts` 的 `Program.exit` 中调用：

```ts
import { appendTemplates } from './transform/createTemplate'

export function Program(path: BabelProgramPath, state: BabelState) {
  path.traverse(visitor, state)

  // 退出时收集所有模板变量声明
  appendTemplates(path)
}
```

---

## 4. 关键类型参考

```ts
// packages/compiler/src/utils/types.ts 中已定义

type TransformResults = {
  template: string               // 静态 HTML 模板字符串
  templateWithClosingTags: string // 含闭合标签的模板
  declarations: t.Statement[]     // 变量声明（模板 + refs）
  exprs: t.Statement[]             // 动态表达式（setter 调用）
  dynamics: DynamicAttr[]          // 需要 effect 包装的属性变更
  postExprs: t.Statement[]         // 后置表达式
  id?: t.Identifier                // 模板变量标识符（el$）
  tagName?: string                 // 标签名（区分组件与 DOM 元素）
  renderer?: 'dom' | 'ssr'
  isSVG?: boolean
  hasCustomElement?: boolean
  isImportNode?: boolean
  skipTemplate?: boolean
}

type DynamicAttr = {
  elem: t.Identifier
  key: string
  value: t.Expression
  isSVG?: boolean
  isCE?: boolean
  tagName?: string
}
```

---

## 5. 最小化优先级

按以下优先级实现：

### 必须实现

1. **`transformNode`** — 分发到各 transform，返回结果对象
2. **`createTemplate` 基础路径** — 当 `result.id` 不存在时，直接返回 `exprs[0]`
3. **`registerTemplate` + `appendTemplates`** — 收集模板到 Program 顶层

### 按需实现

4. **`wrapDynamics`** — 处理动态属性（class、style 等）
5. **静态标记清理** — 如果需要 `@once` 语法糖
