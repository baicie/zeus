# SolidJS 编译方案详尽分析

> 基于 `dom-expressions` 代码库的深度解读

## 目录

- [1. 概述](#1-概述)
- [2. 编译架构总览](#2-编译架构总览)
- [3. Babel 插件入口与编译流程](#3-babel-插件入口与编译流程)
- [4. 核心编译阶段详解](#4-核心编译阶段详解)
  - [4.1 Preprocess 阶段](#41-preprocess-阶段)
  - [4.2 JSX Element/Fragment 转换](#42-jsx-elementfragment-转换)
  - [4.3 Postprocess 阶段](#43-postprocess-阶段)
- [5. DOM 渲染模式（模板编译）](#5-dom-渲染模式模板编译)
  - [5.1 模板创建与复用](#51-模板创建与复用)
  - [5.2 元素节点处理](#52-元素节点处理)
  - [5.3 属性处理详解](#53-属性处理详解)
  - [5.4 事件委托机制](#54-事件委托机制)
  - [5.5 动态样式与类名](#55-动态样式与类名)
  - [5.6 展开属性（Spread）](#56-展开属性spread)
  - [5.7 动态子节点处理](#57-动态子节点处理)
  - [5.8 水合（Hydration）支持](#58-水合hydration支持)
- [6. SSR 渲染模式](#6-ssr-渲染模式)
  - [6.1 SSR 模板生成](#61-ssr-模板生成)
  - [6.2 SSR 属性处理](#62-ssr-属性处理)
  - [6.3 SSR 水合标记](#63-ssr-水合标记)
- [7. 组件编译](#7-组件编译)
- [8. 片段（Fragment）编译](#8-片段fragment-编译)
- [9. 条件与循环处理](#9-条件与循环处理)
- [10. 运行时详解](#10-运行时详解)
  - [10.1 模板函数](#101-模板函数)
  - [10.2 事件委托](#102-事件委托)
  - [10.3 属性设置](#103-属性设置)
  - [10.4 节点插入与协调](#104-节点插入与协调)
  - [10.5 SSR 运行时](#105-ssr-运行时)
- [11. 配置选项详解](#11-配置选项详解)
- [12. 编译输出示例](#12-编译输出示例)
- [13. 编译优化策略](#13-编译优化策略)
- [14. 与其他 JSX 编译器的对比](#14-与其他-jsx-编译器的对比)

---

## 1. 概述

`dom-expressions` 是 SolidJS 框架的核心编译基础设施，通过 Babel 插件将 JSX 语法转换为高效的 JavaScript 代码。与 React 等传统虚拟 DOM 框架不同，SolidJS 采用**精细化响应式系统**（Fine-Grained Reactivity），编译器在编译期就能确定哪些部分是动态的，从而生成极高效的运行时代码。

### 核心设计哲学

1. **编译时确定动态性**：编译器分析 JSX 表达式，在编译期判断哪些是静态的、哪些是动态的
2. **模板复用**：静态 HTML 结构被提取为可复用的模板，只创建一次
3. **最小化运行时开销**：尽可能减少运行时的计算和 DOM 操作
4. **事件委托**：将事件监听器委托给文档或容器元素，减少事件绑定数量
5. **双向渲染支持**：同一套 JSX 语法可以编译为客户端渲染（DOM）或服务端渲染（SSR）代码

---

## 2. 编译架构总览

```
┌─────────────────────────────────────────────────────────────────┐
│                        Babel Plugin                              │
│                                                                  │
│  ┌──────────────┐   ┌────────────────┐   ┌─────────────────┐   │
│  │  Preprocess  │ → │  TransformJSX   │ → │   Postprocess   │   │
│  │  (Program    │   │  (JSXElement/   │   │  (Append        │   │
│  │   enter)     │   │   Fragment)     │   │   Templates)    │   │
│  └──────────────┘   └────────────────┘   └─────────────────┘   │
│                                                                  │
│                      ┌─────────────────┐                       │
│                      │   Config Merging │                       │
│                      └─────────────────┘                       │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
        ┌──────────────────────────────────────────────────┐
        │              Target Code Generation               │
        │                                                    │
        │  ┌────────────────┐     ┌────────────────────┐  │
        │  │  DOM Mode      │     │  SSR Mode           │  │
        │  │  template()    │     │  ssr()              │  │
        │  │  insert()      │     │  ssrElement()       │  │
        │  │  setAttribute()│     │  escape()           │  │
        │  │  delegateEvents│     │  ssrHydrationKey()  │  │
        │  └────────────────┘     └────────────────────┘  │
        └──────────────────────────────────────────────────┘
```

### 包结构

```
packages/
├── babel-plugin-jsx-dom-expressions/
│   └── src/
│       ├── index.ts                 # Babel 插件入口
│       ├── config.ts                # 默认配置
│       ├── VoidElements.ts          # 自闭合元素列表
│       ├── dom/
│       │   ├── constants.js         # DOM 特有的内联/块级元素定义
│       │   ├── element.js           # DOM 元素转换
│       │   └── template.js          # DOM 模板生成
│       ├── ssr/
│       │   ├── element.js           # SSR 元素转换
│       │   └── template.js          # SSR 模板生成
│       ├── universal/
│       │   ├── element.js           # 通用元素转换（跨平台）
│       │   └── template.js          # 通用模板生成
│       └── shared/
│           ├── component.js         # 组件转换
│           ├── fragment.js          # Fragment 转换
│           ├── preprocess.js        # 预处理器
│           ├── postprocess.js       # 后处理器
│           ├── transform.js         # 核心转换逻辑
│           ├── utils.js             # 工具函数
│           └── validate.js          # 模板验证
└── dom-expressions/
    └── src/
        ├── client.js                # 客户端运行时
        ├── server.js                # SSR 运行时
        ├── constants.js             # 常量定义（属性名、事件名等）
        └── reconcile.js             # 数组协调算法
```

---

## 3. Babel 插件入口与编译流程

### 3.1 插件入口 (`index.ts`)

```typescript
import SyntaxJSX from "@babel/plugin-syntax-jsx";
import { transformJSX } from "./shared/transform";
import postprocess from "./shared/postprocess";
import preprocess from "./shared/preprocess";

export default () => ({
  name: "JSX DOM Expressions",
  inherits: SyntaxJSX.default,
  visitor: {
    JSXElement: transformJSX,
    JSXFragment: transformJSX,
    Program: {
      enter: preprocess,   // Program 进入时执行
      exit: postprocess   // Program 退出时执行
    }
  }
});
```

插件通过 Babel 的 `visitor` 模式注册了以下访问器：

| 访问器 | 时机 | 功能 |
|--------|------|------|
| `Program.enter` | AST 遍历开始 | 合并用户配置与默认配置 |
| `JSXElement` | 遍历到 JSX 元素 | 转换 JSX 元素为核心代码 |
| `JSXFragment` | 遍历到 JSX 片段 | 转换 JSX 片段为核心代码 |
| `Program.exit` | AST 遍历结束 | 追加模板声明、事件委托调用 |

### 3.2 配置合并 (`preprocess.js`)

```javascript
export default (path, state) => {
  const merged = (path.hub.file.metadata.config = 
    Object.assign({}, config, state.opts));
  // ...
};
```

用户配置与默认配置合并后存入 `file.metadata.config`，后续所有处理函数都可以通过 `getConfig(path)` 获取。

### 3.3 编译流程时序图

```
源代码 JSX
    │
    ▼
┌─────────────────────────┐
│ preprocess (Program)    │ ← 合并配置
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ transformJSX            │
│   ├─ transformThis       │ ← 转换 this 引用
│   ├─ transformNode       │ ← 递归转换子节点
│   │   ├─ JSXElement → transformElement
│   │   │   ├─ DOM mode → dom/element.js
│   │   │   ├─ SSR mode → ssr/element.js
│   │   │   └─ Universal mode → universal/element.js
│   │   ├─ JSXFragment → transformFragmentChildren
│   │   ├─ JSXText → 生成静态文本
│   │   └─ JSXExpressionContainer → 生成动态表达式
│   ├─ getCreateTemplate   │ ← 选择模板生成函数
│   └─ createTemplate      │ ← 生成最终模板调用
└─────────────────────────┘
    │
    ▼
┌─────────────────────────┐
│ postprocess (Program)   │ ← 追加模板和事件委托
└─────────────────────────┘
    │
    ▼
输出代码
```

---

## 4. 核心编译阶段详解

### 4.1 Preprocess 阶段

在 AST 遍历开始时，`preprocess` 函数完成以下工作：

1. **配置合并**：将默认配置与用户传入的选项合并
2. **选择性处理**：在 `requireImportSource` 模式下，仅处理带有特定注释的文件

```javascript
const merged = (path.hub.file.metadata.config = 
  Object.assign({}, config, state.opts));
```

### 4.2 JSX Element/Fragment 转换

#### 4.2.1 节点类型判断

`transformNode` 函数根据节点类型分发到不同的处理函数：

```javascript
export function transformNode(path, info = {}) {
  const node = path.node;
  if (t.isJSXElement(node)) {
    return transformElement(config, path, info);
  } else if (t.isJSXFragment(node)) {
    return transformFragmentChildren(path.get("children"), results, config);
  } else if (t.isJSXText(node)) {
    // 生成静态文本节点
  } else if (t.isJSXExpressionContainer(node)) {
    // 生成动态表达式
  }
}
```

#### 4.2.2 元素类型判断

编译器通过以下规则判断一个 JSX 元素是**原生元素**还是**组件**：

```javascript
export function isComponent(tagName) {
  return (
    (tagName[0] && tagName[0].toLowerCase() !== tagName[0]) ||  // 首字母大写
    tagName.includes(".") ||                                     // 包含点号（属性访问）
    /[^a-zA-Z]/.test(tagName[0])                                // 首字符非字母
  );
}
```

| 规则 | 示例 | 判断结果 |
|------|------|----------|
| 首字母大写 | `<div>` → `div` → `false` | 原生元素 |
| 首字母大写 | `<MyComponent>` → `MyComponent` → `true` | 组件 |
| 包含点号 | `<Foo.Bar>` | 组件 |
| 非字母开头 | `<$dynamic>` | 组件 |

#### 4.2.3 动态性检测 (`isDynamic`)

这是编译器的核心算法之一，用于判断一个表达式是否为动态表达式：

```javascript
export function isDynamic(path, { checkMember, checkTags, checkCallExpressions = true, native }) {
  // 1. 函数表达式 → 静态
  if (t.isFunction(expr)) return false;
  
  // 2. @once 注释标记 → 静态
  if (expr.leadingComments?.[0]?.value.trim() === config.staticMarker) return false;
  
  // 3. 函数调用 → 动态
  if (checkCallExpressions && t.isCallExpression(expr)) return true;
  
  // 4. 成员访问 → 动态
  if (checkMember && t.isMemberExpression(expr)) return true;
  
  // 5. JSX 元素/片段 → 动态
  if (checkTags && t.isJSXElement(expr)) return true;
  
  // 6. 深度遍历查找
  path.traverse({
    CallExpression(p) { dynamic = true; },
    MemberExpression(p) { dynamic = true; },
    JSXElement(p) { dynamic = true; }
    // ...
  });
  return dynamic;
}
```

**检测规则总结**：

| 表达式类型 | `checkMember=true` | `checkCallExpressions=true` | `checkTags=true` | 结果 |
|-----------|-------------------|---------------------------|----------------|------|
| 简单变量 `a` | - | - | - | 静态 |
| 成员访问 `a.b` | ✓ | - | - | 动态 |
| 函数调用 `fn()` | - | ✓ | - | 动态 |
| JSX 元素 `<div>` | - | - | ✓ | 动态 |
| 字面量 `1 + 2` | - | - | - | 静态（常量折叠） |

### 4.3 Postprocess 阶段

AST 遍历结束后，`postprocess` 函数追加以下内容：

```javascript
export default (path, state) => {
  // 1. 追加事件委托调用
  if (path.scope.data.events) {
    path.node.body.push(
      t.expressionStatement(
        t.callExpression(
          registerImportMethod(path, "delegateEvents"),
          [t.arrayExpression(Array.from(path.scope.data.events).map(e => t.stringLiteral(e)))]
        )
      )
    );
  }
  
  // 2. 追加模板声明
  if (path.scope.data.templates?.length) {
    domTemplates.length > 0 && appendTemplatesDOM(path, domTemplates);
    ssrTemplates.length > 0 && appendTemplatesSSR(path, ssrTemplates);
  }
};
```

---

## 5. DOM 渲染模式（模板编译）

DOM 模式是 SolidJS 最常用的编译目标，它通过**模板复用**策略显著提升性能。

### 5.1 模板创建与复用

#### 5.1.1 模板注册 (`dom/template.js`)

```javascript
function registerTemplate(path, results) {
  const { hydratable } = getConfig(path);
  let decl;
  if (results.template.length) {
    const templates = path.scope.getProgramParent().data.templates || 
                      (path.scope.getProgramParent().data.templates = []);
    
    // 查找是否存在相同模板
    const existingTemplate = templates.find(t => t.template === results.template);
    
    if (existingTemplate) {
      templateId = existingTemplate.id;  // 复用现有模板
    } else {
      templateId = path.scope.generateUidIdentifier("tmpl$");
      templates.push({
        id: templateId,
        template: results.template,
        templateWithClosingTags: results.templateWithClosingTags,
        isSVG: results.isSVG,
        isCE: results.hasCustomElement,
        isImportNode: results.isImportNode,
        renderer: "dom"
      });
    }
  }
}
```

**模板复用机制**：
- 编译器使用字符串哈希（基于模板内容）来检测相同模板
- 相同模板只创建一次，多个 JSX 节点共享同一个模板 ID
- 这对于列表渲染特别有效 —— 列表中相同结构的元素共享模板

#### 5.1.2 模板函数生成 (`createTemplate`)

```javascript
export function createTemplate(path, result, wrap) {
  const config = getConfig(path);
  
  if (result.id) {
    registerTemplate(path, result);
    
    // 纯静态元素：直接返回元素引用
    if (!(result.exprs.length || result.dynamics.length || result.postExprs.length) &&
        result.decl.declarations.length === 1) {
      return result.decl.declarations[0].init;
    }
    
    // 动态元素：包装为箭头函数
    return t.callExpression(
      t.arrowFunctionExpression([], t.blockStatement([
        result.decl,
        ...result.exprs.concat(wrapDynamics(path, result.dynamics) || [], result.postExprs || []),
        t.returnStatement(result.id)
      ])),
      []
    );
  }
  
  // 无 ID 的纯动态元素
  return result.exprs[0];
}
```

### 5.2 元素节点处理

#### 5.2.1 元素创建 (`transformElement` in `dom/element.js`)

```javascript
export function transformElement(path, info) {
  let tagName = getTagName(path.node),
      config = getConfig(path),
      wrapSVG = info.topLevel && tagName != "svg" && SVGElements.has(tagName),
      voidTag = VoidElements.indexOf(tagName) > -1,
      isCustomElement = tagName.indexOf("-") > -1,
      results = {
        template: `<${tagName}`,
        templateWithClosingTags: `<${tagName}`,
        declarations: [],
        exprs: [],
        dynamics: [],
        postExprs: [],
        isSVG: wrapSVG,
        hasCustomElement: isCustomElement,
        tagName,
        renderer: "dom"
      };
  
  // 生成元素引用 ID
  if (!info.skipId) {
    results.id = path.scope.generateUidIdentifier("el$");
  }
  
  // 处理 SVG 包装
  if (wrapSVG) {
    results.template = "<svg>" + results.template;
  }
  
  // 处理属性
  transformAttributes(path, results);
  
  // 闭合标签
  results.template += ">";
  
  // 处理子节点（除自闭合标签外）
  if (!voidTag) {
    transformChildren(path, results, config);
    results.template += `</${tagName}>`;
  }
  
  return results;
}
```

#### 5.2.2 元素引用变量声明

```javascript
// 在 registerTemplate 中生成的声明：
decl = hydratable
  ? t.callExpression(
      registerImportMethod(path, "getNextElement"),
      templateId ? [templateId] : []
    )
  : t.callExpression(templateId, []);
```

### 5.3 属性处理详解

#### 5.3.1 属性分类

属性被分为以下几类：

| 类型 | 示例 | 处理方式 |
|------|------|----------|
| 静态属性 | `class="foo"` | 直接写入模板字符串 |
| 动态属性 | `class={name}` | 生成属性设置表达式 |
| 事件属性 | `onClick={fn}` | 委托或直接绑定 |
| 样式属性 | `style={{color: 'red'}}` | `style()` 运行时函数 |
| 类名切换 | `classList={{active: bool}}` | `classList()` 运行时函数 |
| ref 属性 | `ref={el => ...}` | `use()` 运行时函数 |
| 命名空间属性 | `class:name={bool}` | 转换为特定处理 |

#### 5.3.2 属性处理流程 (`transformAttributes`)

```javascript
function transformAttributes(path, results) {
  let elem = results.id,
      hasHydratableEvent = false,
      children,
      spreadExpr,
      attributes = path.get("openingElement").get("attributes");
  
  // 1. 处理 Spread 属性
  if (attributes.some(a => t.isJSXSpreadAttribute(a.node))) {
    [attributes, spreadExpr] = processSpreads(path, attributes, {...});
  }
  
  // 2. 处理 Style 属性（内联优化）
  // { color: 'red', fontSize: 14 } → "color:red;font-size:14px;"
  // ...
  
  // 3. 处理 classList 属性
  // { active: bool, disabled: isDisabled }
  // → 生成 class:active={...} class:disabled={...} 表达式
  // ...
  
  // 4. 合并多个 class 属性
  // <div class="a" class={b} /> → <div class={`a ${b}`} />
  // ...
  
  // 5. 遍历处理每个属性
  attributes.forEach(attribute => {
    const node = attribute.node;
    let key = /* ... */;
    let value = node.value;
    
    if (/* 动态属性 */) {
      if (key === "ref") {
        // ref 处理
      } else if (key.startsWith("use:")) {
        // use: 指令处理
      } else if (key.startsWith("on")) {
        // 事件处理
      } else if (/* 动态样式/类名 */) {
        results.dynamics.push({ elem, key, value: value.expression, ... });
      } else {
        results.exprs.push(
          t.expressionStatement(setAttr(attribute, elem, key, value.expression, {...}))
        );
      }
    } else {
      // 静态属性 → 直接写入模板
      inlineAttributeOnTemplate(isSVG, key, results, value);
    }
  });
}
```

#### 5.3.3 `setAttr` 函数

```javascript
export function setAttr(path, elem, name, value, { isSVG, dynamic, prevId, isCE, tagName }) {
  // 1. 解析命名空间
  const parts = name.split(":");
  if (parts[1] && reservedNameSpaces.has(parts[0])) {
    name = parts[1];
    namespace = parts[0];
  }
  
  // 2. style: 命名空间
  if (namespace === "style") {
    return t.callExpression(setStyleProperty, [elem, t.stringLiteral(name), value]);
  }
  
  // 3. class: 命名空间 → classList.toggle
  if (namespace === "class") {
    return t.callExpression(
      t.memberExpression(elem.classList, t.identifier("toggle")),
      [t.stringLiteral(name), value]
    );
  }
  
  // 4. 样式对象
  if (name === "style") {
    return t.callExpression(style, prevId ? [elem, value, prevId] : [elem, value]);
  }
  
  // 5. classList
  if (name === "classList") {
    return t.callExpression(classList, prevId ? [elem, value, prevId] : [elem, value]);
  }
  
  // 6. bool: 命名空间 → setBoolAttribute
  if (namespace === "bool") {
    return t.callExpression(setBoolAttribute, [elem, t.stringLiteral(name), value]);
  }
  
  // 7. DOM 属性 vs HTML 属性
  if (/* 是 DOM 属性或自定义元素 */) {
    if (config.hydratable) {
      return t.callExpression(setProperty, [elem, t.stringLiteral(alias || name), value]);
    }
    return t.assignmentExpression("=", t.memberExpression(elem, t.identifier(alias || name)), value);
  }
  
  // 8. SVG 命名空间
  if (ns) {
    return t.callExpression(setAttributeNS, [elem, t.stringLiteral(ns), t.stringLiteral(name), value]);
  }
  
  // 9. 普通 HTML 属性
  return t.callExpression(setAttribute, [elem, t.stringLiteral(name), value]);
}
```

### 5.4 事件委托机制

#### 5.4.1 委托事件列表 (`DelegatedEvents`)

```javascript
const DelegatedEvents = new Set([
  "beforeinput", "click", "dblclick", "contextmenu",
  "focusin", "focusout", "input", "keydown", "keyup",
  "mousedown", "mousemove", "mouseout", "mouseover", "mouseup",
  "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup",
  "touchend", "touchmove", "touchstart"
]);
```

#### 5.4.2 事件处理编译

```javascript
if (key.startsWith("on")) {
  const ev = toEventName(key);  // onClick → click
  
  if (key.startsWith("on:")) {
    // 强制非委托模式：on:click={fn}
    results.exprs.unshift(
      t.expressionStatement(
        t.callExpression(addEventListener, [elem, t.stringLiteral(key.split(":")[1]), value.expression])
      )
    );
  } else if (config.delegateEvents && DelegatedEvents.has(ev)) {
    // 委托模式：将处理器赋值给元素
    results.exprs.unshift(
      t.expressionStatement(
        t.assignmentExpression("=", t.memberExpression(elem, t.identifier(`$$${ev}`)), handler)
      )
    );
    // 收集事件名，用于后续 delegateEvents 调用
    events.add(ev);
  } else {
    // 非委托事件：直接绑定
    results.exprs.unshift(
      t.expressionStatement(
        t.callExpression(addEventListener, [elem, t.stringLiteral(ev), handler])
      )
    );
  }
}
```

#### 5.4.3 事件委托运行时 (`delegateEvents`)

```javascript
export function delegateEvents(eventNames, document = window.document) {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  for (const name of eventNames) {
    if (!e.has(name)) {
      e.add(name);
      document.addEventListener(name, eventHandler);  // 绑定到 document
    }
  }
}

function eventHandler(e) {
  let node = e.target;
  const key = `$$${e.type}`;  // 如 "$click"
  
  while (handleNode() && (node = node._$host || node.parentNode)) {
    // 向上遍历 DOM 树，查找带事件处理器的元素
  }
  
  function handleNode() {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
    }
  }
}
```

### 5.5 动态样式与类名

#### 5.5.1 `classList` 编译

对于 `<div classList={{ active: isActive, disabled: isDisabled }} />`：

```javascript
// 编译为：
effect(() => classList(el, { active: isActive(), disabled: isDisabled() }, {}));
```

#### 5.5.2 动态样式编译

```javascript
// 编译为：
effect(() => style(el, { color: color(), fontSize: size() }, {}));
```

### 5.6 展开属性（Spread）

```javascript
function processSpreads(path, attributes, { elem, isSVG, hasChildren, wrapConditionals }) {
  const spreadArgs = [];
  let runningObject = [];
  let dynamicSpread = false;
  
  attributes.forEach(attribute => {
    if (t.isJSXSpreadAttribute(node)) {
      // 收集展开对象
      const s = isDynamic(attribute.get("argument"), { checkMember: true })
        ? t.arrowFunctionExpression([], node.argument)  // 包装为函数
        : node.argument;
      spreadArgs.push(s);
      dynamicSpread = true;
    } else {
      // 收集普通属性到运行对象
      runningObject.push(t.objectProperty(t.stringLiteral(key), value));
    }
  });
  
  // 合并所有参数
  const props = t.callExpression(mergeProps, spreadArgs);
  
  // 生成 spread 调用
  return [filteredAttributes, t.expressionStatement(spread(node, props, isSVG, hasChildren))];
}
```

### 5.7 动态子节点处理

#### 5.7.1 子节点处理流程

```javascript
function transformChildren(path, results, config) {
  const filteredChildren = filterChildren(path.get("children"));
  const lastElement = findLastElement(filteredChildren, config.hydratable);
  
  filteredChildren.forEach((child, index) => {
    const transformed = transformNode(child, {
      toBeClosed: results.toBeClosed,
      lastElement: index === lastElement,
      skipId: !results.id || !detectExpressions(filteredChildren, index, config)
    });
    
    if (transformed.id) {
      // 有 ID 的子节点 → 静态或部分静态
      results.declarations.push(
        t.variableDeclarator(child.id, t.memberExpression(tempPath, /* 导航属性 */))
      );
      results.declarations.push(...child.declarations);
      results.exprs.push(...child.exprs);
    } else if (child.exprs.length) {
      // 纯动态子节点 → 使用 insert 插入
      results.exprs.push(
        t.expressionStatement(
          t.callExpression(insert, [results.id, child.exprs[0], nextChild()])
        )
      );
    }
  });
}
```

#### 5.7.2 文本节点合并

相邻的静态文本节点会被合并，减少模板碎片：

```javascript
if (transformed.text && memo[i - 1].text) {
  memo[i - 1].template += transformed.template;
}
```

### 5.8 水合（Hydration）支持

#### 5.8.1 水合标记

```javascript
function createPlaceholder(path, results, tempPath, i, char) {
  const exprId = path.scope.generateUidIdentifier("el$");
  let contentId;
  results.template += `<!${char}>`;  // 如 <!$>, <!/>
  
  if (config.hydratable && char === "/") {
    // 需要获取内容占位符
    contentId = path.scope.generateUidIdentifier("co$");
    results.declarations.push(
      t.variableDeclarator(
        t.arrayPattern([exprId, contentId]),
        t.callExpression(getNextMarker, [/* 导航 */])
      )
    );
  } else {
    results.declarations.push(
      t.variableDeclarator(exprId, t.memberExpression(/* 导航 */))
    );
  }
  return [exprId, contentId];
}
```

#### 5.8.2 水合标记注释

| 标记 | 用途 | 运行时行为 |
|------|------|------------|
| `<!$>` | 动态表达式占位符（开始） | 定位第一个动态内容 |
| `<!/>` | 动态表达式占位符（结束） | 配合开始标记定位内容 |

---

## 6. SSR 渲染模式

### 6.1 SSR 模板生成

SSR 模式使用完全不同的策略 —— 生成 HTML 字符串而非 DOM 操作：

```javascript
export function createTemplate(path, result) {
  if (!result.template) {
    return result.exprs[0];
  }
  
  // 模板数组：[静态片段1, 动态片段1, 静态片段2, ...]
  let template;
  if (!Array.isArray(result.template)) {
    template = t.stringLiteral(result.template);
  } else if (result.template.length === 1) {
    template = t.stringLiteral(result.template[0]);
  } else {
    const strings = result.template.map(tmpl => t.stringLiteral(tmpl));
    template = t.arrayExpression(strings);
  }
  
  // 注册模板
  // ...
  
  // 生成 ssr 调用
  return t.callExpression(
    registerImportMethod(path, "ssr"),
    Array.isArray(result.template) && result.template.length > 1
      ? [id, ...result.templateValues]
      : [id]
  );
}
```

### 6.2 SSR 属性处理

SSR 属性处理与 DOM 模式的主要区别：

1. **无运行时 DOM 操作**：所有属性都内联到 HTML 字符串中
2. **需要转义**：对用户输入进行 HTML 转义
3. **布尔属性处理**：SSR 中布尔属性用特殊标记

```javascript
// SSR 布尔属性
if (BooleanAttributes.has(key) || key.startsWith("bool:")) {
  results.template.push("");
  const fn = t.callExpression(registerImportMethod(attribute, "ssrAttribute"), [
    t.stringLiteral(key),
    value.expression,
    t.booleanLiteral(true)
  ]);
  results.templateValues.push(fn);
  return;
}

// SSR classList
if (key === "classList") {
  value.expression = t.callExpression(registerImportMethod(path, "ssrClassList"), [value.expression]);
  key = "class";
  doEscape = false;
}

// SSR style
if (key === "style") {
  value.expression = t.callExpression(registerImportMethod(path, "ssrStyle"), [value.expression]);
  doEscape = false;
}
```

### 6.3 SSR 水合标记

```javascript
export function ssrHydrationKey() {
  const hk = getHydrationKey();
  return hk ? ` data-hk="${hk}"` : "";
}
```

SSR 输出的 HTML 带有 `data-hk` 属性，用于客户端水合时定位 DOM 节点。

---

## 7. 组件编译

### 7.1 组件处理流程

```javascript
export default function transformComponent(path) {
  const tagId = convertComponentIdentifier(path.node.openingElement.name);
  const props = [];
  const runningObject = [];
  let dynamicSpread = false;
  
  // 1. 处理组件属性
  path.get("openingElement").get("attributes").forEach(attribute => {
    if (t.isJSXSpreadAttribute(node)) {
      // 处理展开属性
      props.push(/* 动态或静态展开 */);
    } else {
      const id = convertJSXIdentifier(node.name);
      const key = id.name;
      
      if (/* 动态值 */) {
        // 动态属性 → 生成 getter
        runningObject.push(
          t.objectMethod("get", id, [], 
            t.blockStatement([t.returnStatement(value.expression)]),
            !t.isValidIdentifier(key)
          )
        );
      } else {
        // 静态属性
        runningObject.push(t.objectProperty(id, value.expression));
      }
    }
  });
  
  // 2. 处理子节点作为 children prop
  const childResult = transformComponentChildren(path.get("children"), config);
  
  // 3. 合并所有 props
  props.push(t.objectExpression(runningObject));
  const mergedProps = props.length > 1 
    ? t.callExpression(mergeProps, props)
    : props[0];
  
  // 4. 生成 createComponent 调用
  return {
    exprs: [t.callExpression(createComponent, [tagId, mergedProps])],
    template: "",
    component: true
  };
}
```

### 7.2 组件子节点处理

```javascript
function transformComponentChildren(children, config) {
  const filteredChildren = filterChildren(children);
  
  let transformedChildren = filteredChildren.reduce((memo, path) => {
    if (t.isJSXText(path.node)) {
      // 静态文本
      memo.push(t.stringLiteral(v));
    } else {
      // 动态子节点
      const child = transformNode(path, {
        topLevel: true,
        componentChild: true,
        lastElement: true
      });
      memo.push(getCreateTemplate(config, path, child)(path, child, /* ... */));
    }
    return memo;
  }, []);
  
  // 单个子节点 vs 多个子节点
  if (transformedChildren.length === 1) {
    transformedChildren = /* 包装为函数或直接返回 */;
  } else {
    transformedChildren = t.arrowFunctionExpression([], t.arrayExpression(transformedChildren));
  }
  
  return [transformedChildren, dynamic];
}
```

---

## 8. 片段（Fragment）编译

```javascript
export default function transformFragmentChildren(children, results, config) {
  const filteredChildren = filterChildren(children);
  
  let childNodes = filteredChildren.reduce((memo, path) => {
    if (t.isJSXText(path.node)) {
      const v = decode(trimWhitespace(path.node.extra.raw));
      if (v.length) memo.push(t.stringLiteral(v));
    } else {
      const child = transformNode(path, {
        topLevel: true,
        fragmentChild: true,
        lastElement: true
      });
      memo.push(getCreateTemplate(config, path, child)(path, child, true));
    }
    return memo;
  }, []);
  
  // Fragment 的结果是一个数组或单个表达式
  results.exprs.push(
    childNodes.length === 1 
      ? childNodes[0] 
      : t.arrayExpression(childNodes)
  );
}
```

---

## 9. 条件与循环处理

### 9.1 条件表达式转换 (`transformCondition`)

对于 `<div>{flag ? <A/> : <B/>}</div>`：

```javascript
if (t.isConditionalExpression(expr)) {
  const dTest = isDynamic(path.get("test"), { checkMember: true });
  if (dTest) {
    // 将条件包装为 memo
    const id = inline
      ? t.callExpression(memo, [t.arrowFunctionExpression([], cond)])
      : path.scope.generateUidIdentifier("_c$");
    expr.test = t.callExpression(id, []);
  }
}
```

### 9.2 逻辑表达式转换

对于 `<div>{flag && <A/>}</div>`：

```javascript
if (t.isLogicalExpression(expr) && expr.operator === "&&") {
  const dTest = isDynamic(nextPath.get("right"), { checkTags: true, checkMember: true });
  if (dTest) {
    // 包装左侧条件
    nextPath.node.left = t.callExpression(memo, [t.arrowFunctionExpression([], cond)]);
  }
}
```

---

## 10. 运行时详解

### 10.1 模板函数

```javascript
export function template(html, isImportNode, isSVG, isMathML) {
  let node;
  const create = () => {
    const t = document.createElement("template");
    t.innerHTML = html;
    
    return isSVG ? t.content.firstChild.firstChild
         : isMathML ? t.firstChild
         : t.content.firstChild;
  };
  
  const fn = isImportNode
    ? () => untrack(() => document.importNode(node || (node = create()), true))
    : () => (node || (node = create())).cloneNode(true);
  
  fn.cloneNode = fn;
  return fn;
}
```

**模板复用原理**：
1. HTML 字符串被传入 `innerHTML`，浏览器自动解析为 DOM 结构
2. 通过 `template.content.firstChild` 获取根元素
3. 后续调用通过 `cloneNode(true)` 复制模板

### 10.2 事件委托

```javascript
export function delegateEvents(eventNames, document = window.document) {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  for (const name of eventNames) {
    if (!e.has(name)) {
      e.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}

function eventHandler(e) {
  let node = e.target;
  const key = `$$${e.type}`;
  
  // 遍历 DOM 树，向上查找带事件处理器的节点
  while (handleNode() && (node = node._$host || node.parentNode)) {}
  
  function handleNode() {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      handler.call(node, data !== undefined ? data : e);
    }
  }
}
```

### 10.3 属性设置

```javascript
export function setProperty(node, name, value) {
  if (isHydrating(node)) return;
  node[name] = value;
}

export function setAttribute(node, name, value) {
  if (isHydrating(node)) return;
  if (value == null) node.removeAttribute(name);
  else node.setAttribute(name, value);
}

export function setBoolAttribute(node, name, value) {
  if (isHydrating(node)) return;
  value ? node.setAttribute(name, "") : node.removeAttribute(name);
}
```

### 10.4 节点插入与协调

```javascript
export function insert(parent, accessor, marker, initial) {
  if (marker !== undefined && !initial) initial = [];
  if (typeof accessor !== "function") {
    return insertExpression(parent, accessor, initial, marker);
  }
  effect(current => insertExpression(parent, accessor(), current, marker), initial);
}

function insertExpression(parent, value, current, marker, unwrapArray) {
  const t = typeof value;
  
  if (t === "string" || t === "number") {
    // 文本节点优化
    if (multi) {
      // 使用 marker 定位
      let node = current[0];
      if (node && node.nodeType === 3) {
        node.data !== value && (node.data = value);
      } else {
        node = document.createTextNode(value);
      }
      current = cleanChildren(parent, current, marker, node);
    } else {
      parent.textContent = value;
    }
  } else if (Array.isArray(value)) {
    // 数组协调
    if (currentArray) {
      reconcileArrays(parent, current, array);
    } else {
      appendNodes(parent, array);
    }
  } else if (value.nodeType) {
    // 单个 DOM 节点
    if (current == null || current === "") {
      parent.appendChild(value);
    } else {
      parent.replaceChild(value, parent.firstChild);
    }
  } else if (t === "function") {
    // 动态值 → 包装为 effect
    effect(() => {
      let v = value();
      while (typeof v === "function") v = v();
      current = insertExpression(parent, v, current, marker);
    });
  }
  
  return current;
}
```

### 10.5 SSR 运行时

```javascript
export function ssr(t, ...nodes) {
  if (nodes.length) {
    let result = "";
    for (let i = 0; i < nodes.length; i++) {
      result += t[i];
      const node = nodes[i];
      if (node !== undefined) result += resolveSSRNode(node);
    }
    t = result + t[nodes.length];
  }
  return { t };
}

export function escape(s, attr) {
  const delim = attr ? '"' : "<";
  const escDelim = attr ? "&quot;" : "&lt;";
  // 逐字符转义 & 和分隔符
  // ...
  return result;
}
```

---

## 11. 配置选项详解

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `moduleName` | `"dom"` | 运行时模块名 |
| `generate` | `"dom"` | 生成目标：`"dom"` / `"ssr"` / `"universal"` |
| `hydratable` | `false` | 是否支持水合 |
| `delegateEvents` | `true` | 是否使用事件委托 |
| `delegatedEvents` | `[]` | 额外的委托事件列表 |
| `builtIns` | `[]` | 内置组件列表 |
| `requireImportSource` | `false` | 是否要求 `@jsxImportSource` 注释 |
| `wrapConditionals` | `true` | 是否包装条件表达式 |
| `omitNestedClosingTags` | `false` | 省略嵌套闭合标签 |
| `omitLastClosingTag` | `true` | 省略最后闭合标签 |
| `omitQuotes` | `true` | 属性值省略引号（安全时） |
| `contextToCustomElements` | `false` | 传递上下文到自定义元素 |
| `staticMarker` | `"@once"` | 静态标记注释 |
| `effectWrapper` | `"effect"` | 副作用包装函数名 |
| `memoWrapper` | `"memo"` | 记忆化包装函数名 |
| `validate` | `true` | 是否验证模板有效性 |
| `inlineStyles` | `true` | 是否内联静态样式 |

---

## 12. 编译输出示例

### 12.1 简单静态元素

**输入**：
```jsx
<div class="container">
  <h1>Hello</h1>
</div>
```

**输出**：
```javascript
const _tmpl = template('<div class="container"><h1>Hello</h1></div>');

const [el] = templateContent(_tmpl);
// 或直接
const el = _tmpl.cloneNode(true);
```

### 12.2 动态元素

**输入**：
```jsx
<div class={name}>{count}</div>
```

**输出**：
```javascript
const _tmpl = template('<div><!----></div>');

const [el, _el$] = _tmpl();
// 设置属性
effect(() => className(el, name()));
// 设置子节点
insert(el, count, _el$);
```

### 12.3 事件处理

**输入**：
```jsx
<button onClick={handleClick}>Click me</button>
```

**输出**：
```javascript
const _tmpl = template('<button>Click me</button>');

const [el] = _tmpl();
el.$click = handleClick;  // 委托到 document
delegateEvents(["click"]);
```

### 12.4 列表渲染

**输入**：
```jsx
<ul>
  {items.map(item => <li>{item}</li>)}
</ul>
```

**输出**：
```javascript
const _tmpl = template('<ul><li></li></ul>');

const [el] = _tmpl();
insert(el, () => items().map(item => {
  const _tmpl$ = template('<li></li>');
  const [_el$] = _tmpl$();
  insert(_el$, item);
  return _el$;
}));
```

---

## 13. 编译优化策略

### 13.1 模板复用

编译器通过字符串比较检测相同模板，只生成一个模板函数定义。

### 13.2 静态提升

```javascript
// 静态子节点被提升到模板
<div>{staticValue}{dynamicValue}</div>
// 编译为
insert(el, () => `${staticValue}${dynamicValue()}`);
```

### 13.3 文本节点合并

相邻的静态文本节点被合并为一个字符串，减少 `insert` 调用。

### 13.4 批量动态属性

多个动态属性被批量处理，减少 effect 数量：

```javascript
// 多个动态属性
effect(() => {
  const _p$ = {};
  const v$0 = value1();
  const v$1 = value2();
  // 比较并设置
  _p$._$index !== v$0 && setAttribute(el, "attr1", _p$._$index = v$0);
  _p$._$char !== v$1 && classList.toggle(el, "active", _p$._$char = v$1);
  return _p$;
}, { _$index: undefined, _$char: undefined });
```

### 13.5 短路求值优化

```javascript
// 非动态属性不生成比较
classList.toggle(el, "active", !!value);
```

---

## 14. 与其他 JSX 编译器的对比

### 14.1 vs React

| 特性 | React | SolidJS (dom-expressions) |
|------|-------|---------------------------|
| 编译策略 | 虚拟 DOM 差异化 | 模板 + 精细化响应式 |
| 运行时开销 | 每次渲染创建新 VDOM | 仅在响应式依赖变化时更新 |
| 内存分配 | 大量临时对象 | 最小化分配 |
| 初始加载 | 完整 VDOM 库 | 轻量模板函数 |
| 模板复用 | 无（每次重新创建） | 有（静态结构复用） |
| 事件处理 | 每个元素绑定 | 事件委托 |

### 14.2 vs Vue 3

| 特性 | Vue 3 | SolidJS (dom-expressions) |
|------|-------|---------------------------|
| 编译方式 | SFC 单文件组件 | JSX + Babel 插件 |
| 运行时 | 响应式 Proxy | 响应式信号 |
| DOM 更新 | 虚拟 DOM patch | 直接 DOM 操作 |
| 模板语法 | 指令系统 | JSX 表达式 |

### 14.3 核心差异

**dom-expressions 的独特优势**：

1. **编译时完全确定性**：通过 `isDynamic` 分析，编译期就知道所有动态部分
2. **零虚拟 DOM 开销**：直接操作 DOM，无 VDOM 创建和比对
3. **极致性能**：生成代码类似手写的优化代码
4. **SSR/CSR 同构**：同一 JSX 编译为不同目标，代码复用
5. **完整类型推导**：TypeScript 友好，props 类型可推导

---

## 附录 A：常量定义参考

### A.1 自闭合元素

```javascript
const VoidElements = [
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
  'input', 'keygen', 'link', 'menuitem', 'meta',
  'param', 'source', 'track', 'wbr'
];
```

### A.2 DOM 属性

```javascript
const Properties = new Set([
  "className", "value", "readOnly", "noValidate", ...
]);

const ChildProperties = new Set([
  "innerHTML", "textContent", "innerText", "children"
]);

const BooleanAttributes = new Set([
  "allowfullscreen", "async", "autofocus", "checked", ...
]);
```

### A.3 SVG 命名空间

```javascript
const SVGNamespace = {
  xlink: "http://www.w3.org/1999/xlink",
  xml: "http://www.w3.org/XML/1998/namespace"
};
```

### A.4 委托事件

```javascript
const DelegatedEvents = new Set([
  "click", "dblclick", "focusin", "focusout", "input",
  "keydown", "keyup", "mousedown", "mousemove", "mouseout",
  "mouseover", "mouseup", "pointerdown", "pointermove",
  "pointerout", "pointerover", "pointerup",
  "touchend", "touchmove", "touchstart"
]);
```

---

## 附录 B：扩展点

### B.1 自定义渲染器

通过 `config.renderers` 可以注册自定义渲染器：

```javascript
{
  renderers: [
    {
      name: "canvas",
      elements: ["canvas", "context"]
    }
  ]
}
```

### B.2 内置组件注册

```javascript
{
  builtIns: ["For", "Show", "Switch"]
}
```

### B.3 Universal 模式

适用于跨平台渲染（如 Canvas、WebGL）：

```javascript
{
  generate: "universal"
}
```

生成使用 `createElement`、`insertNode`、`setProp` 等通用 API 的代码。

---

## 总结

`dom-expressions` 编译器代表了 JSX 编译领域的先进理念 —— 通过精细化的编译时分析，将 JSX 转换为极致高效的运行时代码。其核心创新包括：

1. **精细化动态性检测**：准确区分静态和动态表达式
2. **模板复用机制**：静态 HTML 结构只创建一次
3. **事件委托策略**：将多个事件监听合并为少数几个
4. **双目标编译**：同一语法编译为 DOM 或 SSR 代码
5. **水合支持**：SSR 输出可被客户端精确水合

这套编译方案对 Zeus 框架的编译器设计具有重要参考价值。
