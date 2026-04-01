# SolidJS Babel Plugin JSX DOM Expressions - 编译器分析文档

> 本文档详细分析 `babel-plugin-jsx-dom-expressions` 的整体功能点、实现方式和架构设计。

## 目录

1. [概述](#1-概述)
2. [核心功能点](#2-核心功能点)
3. [实现方式](#3-实现方式)
4. [架构图](#4-架构图)
5. [核心模块详解](#5-核心模块详解)
6. [配置选项](#6-配置选项)
7. [特殊绑定语法](#7-特殊绑定语法)
8. [转换示例](#8-转换示例)

---

## 1. 概述

### 1.1 什么是 babel-plugin-jsx-dom-expressions

这是一个 Babel 插件，用于将 JSX 语法转换为高效的 DOM 操作代码，专为**细粒度响应式**前端框架设计（如 SolidJS）。与传统的虚拟 DOM 框架（如 React）不同，它不生成 diff 算法代码，而是直接生成精确的 DOM 更新操作。

### 1.2 设计理念

| 传统虚拟 DOM | 本插件方案 |
|-------------|-----------|
| 生成 vdom tree | 生成精确 DOM 操作 |
| diff 算法比较 | 直接定位更新 |
| 全量更新 | 细粒度更新 |
| 需要 key | 不依赖 key |
| 批量更新 | 局部更新 |

### 1.3 三种渲染模式

| 模式 | 配置值 | 用途 | 输出形式 |
|------|--------|------|----------|
| **DOM** | `generate: "dom"` | 客户端渲染 | `template()`, `insert()`, `effect()` |
| **SSR** | `generate: "ssr"` | 服务端渲染/水合 | `ssr()`, `ssrElement()` |
| **Universal** | `generate: "universal"` | 跨平台抽象 | `createElement()`, `setProp()` |

---

## 2. 核心功能点

### 2.1 JSX 元素转换

```jsx
// 输入
<div className="container">
  <h1>Hello</h1>
</div>

// 输出 (DOM 模式)
import { template as _template } from "solid-js/web";
const _tmpl = _template(`<div class="container"><h1>Hello</h1></div>`);
```

### 2.2 动态属性绑定

```jsx
// 输入
<div class={state.className} style={{ color: state.color }} />

// 输出
import { createRenderEffect as _createRenderEffect } from "solid-js";
_createRenderEffect(() => _el$1.className = state.className);
_createRenderEffect(() => _el$1.style.color = state.color);
```

### 2.3 事件处理与委托

```jsx
// 输入
<button onClick={handleClick}>Click</button>

// 输出
_el$2.addEventListener("click", handleClick);
```

当 `delegateEvents: true` 时，使用事件委托：

```javascript
_delegateEvents(["click"]);
```

### 2.4 条件渲染

```jsx
// 输入
{state.show && <div>Content</div>}

// 输出
(() => {
  const _el$3 = _insert(_el$2, (() => {
    if (!state.show) return _memo(() => null);
    return () => <div>Content</div>;
  })(), "</div>");
})();
```

### 2.5 列表渲染

```jsx
// 输入
{state.items.map(item => <li>{item}</li>)}

// 输出
_For(props.items, (item) => <li>{item}</li>);
// 或内联展开
_$for(props.items, (item, index) => _insert(_$fragment, item, "<!--#-->"));
```

### 2.6 组件转换

```jsx
// 输入
<MyComponent propA={value} onEvent={handler} />

// 输出
import { mergeProps } from "solid-js";
const _props = mergeProps({ propA: value }, props);
callComponent(() => MyComponent(_props), handler);
```

### 2.7 Fragment 支持

```jsx
// 输入
<>
  <div>A</div>
  <div>B</div>
</>

// 输出
<>_createFragment([...])
```

### 2.8 静态标记优化

```jsx
// 输入
{/* @once */}<div>{dynamicValue}</div>

// 输出 - 只计算一次
_text = dynamicValue; // 不会包装在 effect 中
```

### 2.9 Ref 处理

```jsx
// 输入
<div ref={el => this.el = el} />

// 输出
_el$1 = _current;
```

### 2.10 SVG 命名空间

```jsx
// 输入
<svg><path d="M0 0" /></svg>

// 输出
const _el$1 = _createElement("svg");
_el$1.setAttribute("xmlns", "http://www.w3.org/2000/svg");
// ...
```

---

## 3. 实现方式

### 3.1 插件架构

```
┌─────────────────────────────────────────────────────────────────┐
│                    Babel Plugin Pipeline                         │
│                                                                  │
│  ┌─────────┐    ┌──────────┐    ┌─────────┐    ┌───────────┐   │
│  │ Program │───▶│ JSXElem  │───▶│ JSXFrag │───▶│  Program  │   │
│  │ (enter) │    │  (JSX)   │    │ (JSX)   │    │  (exit)   │   │
│  └────┬────┘    └────┬─────┘    └────┬────┘    └─────┬─────┘   │
│       │              │                │               │         │
│       ▼              ▼                ▼               ▼         │
│  ┌─────────┐    ┌─────────────────────────┐    ┌───────────┐  │
│  │preprocess│   │     transformJSX         │    │postprocess │  │
│  │(配置合并) │   │  (共享转换逻辑入口)        │    │(注册导入)   │  │
│  └─────────┘    └───────────┬─────────────┘    └───────────┘  │
│                             │                                   │
│              ┌──────────────┼──────────────┐                   │
│              ▼              ▼              ▼                   │
│     ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│     │transformElem│ │transformComp│ │transformFrag│            │
│     └──────┬──────┘ └──────┬──────┘ └──────┬──────┘            │
│            │                │                │                  │
│            ▼                │                │                  │
│  ┌─────────────────┐         │                │                  │
│  │ getCreateTemplate│        │                │                  │
│  │   (模板工厂)      │         │                │                  │
│  └────────┬────────┘         │                │                  │
│           │                  │                │                  │
└───────────┼──────────────────┼────────────────┼──────────────────┘
            │                  │                │
            ▼                  ▼                ▼
     ┌─────────────┐   ┌─────────────┐   ┌─────────────┐
     │ DOM Renderer│   │ SSR Renderer│   │Universal    │
     │ (dom/*)     │   │ (ssr/*)     │   │Renderer     │
     └─────────────┘   └─────────────┘   │(universal/*)│
                                         └─────────────┘
```

### 3.2 转换流程

```
源代码 JSX
    │
    ▼
┌───────────────────────────────────────┐
│  1. Preprocess (preprocess.ts)        │
│     - 合并默认配置与用户配置             │
│     - 处理模块导入 (require/import)    │
└───────────────────────────────────────┘
    │
    ▼
┌───────────────────────────────────────┐
│  2. JSXElement/JSXFragment Visitor    │
│     (transform.ts)                     │
│     - 遍历 AST 节点                     │
│     - 识别元素类型 (DOM/Component)     │
│     - 路由到对应处理器                  │
└───────────────────────────────────────┘
    │
    ├──▶ [DOM Element] ──▶ dom/element.ts
    │                              │
    │                              ▼
    │                      ┌───────────────┐
    │                      │ dom/template.ts│
    │                      │ - createTemplate│
    │                      │ - 生成 HTML 模板│
    │                      └───────────────┘
    │
    ├──▶ [SSR Element] ───▶ ssr/element.ts
    │                              │
    │                              ▼
    │                      ┌───────────────┐
    │                      │ ssr/template.ts│
    │                      │ - ssr()        │
    │                      │ - SSR 字符串   │
    │                      └───────────────┘
    │
    └──▶ [Component] ────▶ shared/component.ts
                                 │
                                 ▼
                         ┌───────────────┐
                         │ - callComponent│
                         │ - mergeProps  │
                         │ - 事件绑定    │
                         └───────────────┘
    │
    ▼
┌───────────────────────────────────────┐
│  3. Postprocess (postprocess.ts)       │
│     - 注册运行时导入                    │
│     - 追加模板变量声明                   │
│     - 验证 HTML 有效性                  │
│     - 生成最终代码                      │
└───────────────────────────────────────┘
    │
    ▼
 最终输出代码
```

### 3.3 核心实现细节

#### 3.3.1 模板创建 (Template Creation)

```javascript
// DOM 模式: 创建静态 HTML 模板
function createTemplate(html) {
  // 生成代码:
  return `
    const _tmpl = template(\`<div class="container"></div>\`);
  `;
}
```

#### 3.3.2 动态属性包装

```javascript
// 使用 createRenderEffect 包装动态更新
function createDynamicAttr(el, prop, expr) {
  return `
    createRenderEffect(() => {
      ${el}.${prop} = ${expr};
    });
  `;
}
```

#### 3.3.3 事件委托

```javascript
// 注册需要委托的事件
const delegatedEvents = [
  "onClick", "onInput", "onChange", "onSubmit"
];

// 生成事件委托代码
function delegateEvents(events) {
  return `
    delegateEvents(${JSON.stringify(events)});
  `;
}
```

#### 3.3.4 子节点插入

```javascript
// 动态子节点的插入处理
function insertChildren(children) {
  return children.map(child => {
    if (isStatic(child)) {
      return `_insert(_el, ${child.raw});`;
    }
    return `_insert(_el, () => ${transform(child)});`;
  }).join('\n');
}
```

---

## 4. 架构图

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              babel-plugin-jsx-dom-expressions                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                          src/                                        │    │
│  │                                                                      │    │
│  │   ┌─────────────┐                                                   │    │
│  │   │   index.ts  │ ◄── Babel Plugin 入口点                           │    │
│  │   │  (主入口)    │     定义 visitor 和 inherited SyntaxJSX           │    │
│  │   └──────┬──────┘                                                   │    │
│  │          │                                                          │    │
│  │          ▼                                                          │    │
│  │   ┌────────────────────────────────────────────────────────────┐    │    │
│  │   │                    shared/ (共享模块)                       │    │    │
│  │   │                                                            │    │    │
│  │   │   ┌────────────┐ ┌────────────┐ ┌───────────┐             │    │    │
│  │   │   │ transform  │ │  component │ │  fragment │             │    │    │
│  │   │   │   .ts      │ │    .ts     │ │   .ts     │             │    │    │
│  │   │   │(核心转换器) │ │ (组件转换)  │ │(Fragment) │             │    │    │
│  │   │   └─────┬──────┘ └─────┬──────┘ └───────────┘             │    │    │
│  │   │         │              │                                   │    │    │
│  │   │         ▼              ▼                                   │    │    │
│  │   │   ┌────────────────────────────────────┐                  │    │    │
│  │   │   │            utils.ts                │                  │    │    │
│  │   │   │  - registerImportMethod()         │                  │    │    │
│  │   │   │  - isDynamic() 判断动态表达式       │                  │    │    │
│  │   │   │  - escapeHTML() HTML转义            │                  │    │    │
│  │   │   │  - getConfig() 获取配置            │                  │    │    │
│  │   │   │  - filterChildren() 过滤子节点      │                  │    │    │
│  │   │   └────────────────────────────────────┘                  │    │    │
│  │   │                                                            │    │    │
│  │   │   ┌────────────┐ ┌────────────┐ ┌────────────┐            │    │    │
│  │   │   │preprocess  │ │ postprocess│ │  validate  │            │    │    │
│  │   │   │   .ts      │ │    .ts     │ │   .ts      │            │    │    │
│  │   │   │(预处理)    │ │  (后处理)   │ │ (HTML验证) │            │    │    │
│  │   │   └────────────┘ └────────────┘ └────────────┘            │    │    │
│  │   └────────────────────────────────────────────────────────────┘    │    │
│  │                              │                                    │    │
│  │          ┌───────────────────┼───────────────────┐                │    │
│  │          ▼                   ▼                   ▼                │    │
│  │   ┌─────────────┐     ┌─────────────┐    ┌─────────────┐         │    │
│  │   │    dom/     │     │    ssr/     │    │ universal/  │         │    │
│  │   │  (DOM渲染)   │     │  (SSR渲染)   │    │ (通用渲染)   │         │    │
│  │   │             │     │             │    │             │         │    │
│  │   │ ┌─────────┐ │     │ ┌─────────┐ │    │ ┌─────────┐ │         │    │
│  │   │ │element  │ │     │ │ element │ │    │ │ element │ │         │    │
│  │   │ │ .js     │ │     │ │  .js    │ │    │ │  .js    │ │         │    │
│  │   │ │(元素转换)│ │     │ │(SSR元素)│ │    │ │(通用元素)│ │         │    │
│  │   │ └────┬────┘ │     │ └────┬────┘ │    │ └────┬────┘ │         │    │
│  │   │      │      │     │      │      │    │      │      │         │    │
│  │   │ ┌────▼────┐ │     │ ┌────▼────┐ │    │ ┌────▼────┐ │         │    │
│  │   │ │template │ │     │ │ template│ │    │ │ template│ │         │    │
│  │   │ │  .js    │ │     │ │   .js   │ │    │ │   .js   │ │         │    │
│  │   │ │(模板生成)│ │     │ │(SSR模板)│ │    │ │(通用模板)│ │         │    │
│  │   │ └─────────┘ │     │ └─────────┘ │    │ └─────────┘ │         │    │
│  │   │             │     │             │    │             │         │    │
│  │   │ ┌─────────┐ │     │             │    │             │         │    │
│  │   │ │constants│ │     │             │    │             │         │    │
│  │   │ │  .js    │ │     │             │    │             │         │    │
│  │   │ │(元素分类)│ │     │             │    │             │         │    │
│  │   │ └─────────┘ │     │             │    │             │         │    │
│  │   └─────────────┘     └─────────────┘    └─────────────┘         │    │
│  │                                                                      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 数据流图

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              JSX Source Code                                  │
│                                                                              │
│  <div className="container">                                                 │
│    <h1 onClick={handler}>{title}</h1>                                       │
│  </div>                                                                      │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                           Babel Parser (babylon)                             │
│                           解析为 AST                                         │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                        AST (Abstract Syntax Tree)                            │
│                                                                              │
│  JSXElement {                                                                │
│    openingElement: JSXOpeningElement {                                       │
│      name: "div",                                                            │
│      attributes: [className="container"]                                     │
│    },                                                                        │
│    closingElement: </div>,                                                    │
│    children: [                                                               │
│      JSXElement {                                                            │
│        openingElement: JSXOpeningElement {                                   │
│          name: "h1",                                                         │
│          attributes: [onClick=handler]                                       │
│        },                                                                    │
│        children: [JSXExpressionContainer {expression: title}]                │
│      }                                                                       │
│    ]                                                                         │
│  }                                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                         Plugin Transformation                                │
│                                                                              │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐          │
│  │   Preprocess    │───▶│ transformJSX   │───▶│   Postprocess   │          │
│  │                 │    │                 │    │                 │          │
│  │ - 合并配置       │    │ - 遍历节点      │    │ - 注册导入      │          │
│  │ - 处理导入源     │    │ - 元素转换      │    │ - 生成模板声明  │          │
│  │                 │    │ - 组件转换      │    │ - 验证 HTML     │          │
│  └─────────────────┘    │ - 事件绑定      │    └─────────────────┘          │
│                          │ - 属性处理      │                │              │
│                          └─────────────────┘                │              │
│                                    │                        │              │
│                                    ▼                        ▼              │
│                          ┌──────────────────────────────────────────┐      │
│                          │          Renderer Selection               │      │
│                          │                                          │      │
│                          │  ┌────────┐ ┌────────┐ ┌────────┐        │      │
│                          │  │  DOM   │ │  SSR   │ │Universal│        │      │
│                          │  └────┬───┘ └───┬───┘ └───┬───┘        │      │
│                          │       │         │         │           │      │
│                          └───────┼─────────┼─────────┼─────────────┘      │
│                                  │         │         │                   │
└──────────────────────────────────┼─────────┼─────────┼───────────────────┘
                                   │         │         │
                                   ▼         ▼         ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                          Generated Code                                       │
│                                                                              │
│  import { template, insert, createRenderEffect } from "solid-js/web";        │
│                                                                              │
│  const _tmpl = template(`<div class="container"><h1></h1></div>`);           │
│                                                                              │
│  export function _createComponent() {                                         │
│    const _el = _tmpl.cloneNode(true);                                         │
│    const _h1 = _el.firstChild;                                                │
│    _h1.addEventListener("click", handler);                                    │
│    createRenderEffect(() => insert(_h1, title));                             │
│    return _el;                                                               │
│  }                                                                           │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 4.3 DOM Renderer 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       dom/element.js                            │
│                    (DOM 元素转换核心)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ transformElement│ ◄── 主入口，根据节点类型分发                  │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ├──► [普通元素] ──► processElement()                  │
│           │                          │                          │
│           │                          ▼                          │
│           │                 ┌─────────────────┐                │
│           │                 │  setAttr()      │                │
│           │                 │  - style:{}     │                │
│           │                 │  - classList    │                │
│           │                 │  - events       │                │
│           │                 │  - ref          │                │
│           │                 │  - svg ns       │                │
│           │                 └────────┬────────┘                │
│           │                          │                          │
│           ├──► [自闭合元素] ──► voidElements 检查               │
│           │                                                      │
│           ├──► [自定义元素] ──► customElements 处理              │
│           │                                                      │
│           └──► [组件] ──► 委托到 shared/component.js             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       dom/template.js                            │
│                      (模板生成器)                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ createTemplate()│ ◄── 核心: 创建 HTML 模板字符串               │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────┐               │
│  │ 生成的代码:                                    │               │
│  │                                              │               │
│  │ import { template } from "solid-js/web";    │               │
│  │ const _tmpl = template(`<div></div>`);       │               │
│  │                                              │               │
│  │ export function render() {                  │               │
│  │   const _el = _tmpl.cloneNode(true);        │               │
│  │   // ... 动态操作                           │               │
│  │   return _el;                               │               │
│  │ }                                           │               │
│  └─────────────────────────────────────────────┘               │
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ appendTemplates │ ◄── 追加模板变量声明到 Program               │
│  └─────────────────┘                                            │
│                                                                  │
│  ┌─────────────────┐                                            │
│  │  wrapDynamics() │ ◄── 包装动态更新代码                         │
│  └─────────────────┘                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.4 SSR Renderer 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       ssr/element.js                            │
│                     (SSR 元素转换)                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ transformElement│ ◄── SSR 模式元素处理                         │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────┐                               │
│  │        setAttr()             │                               │
│  │                             │                               │
│  │  - escapeExpression()        │ ◄── 对动态值进行 HTML 转义     │
│  │  - attribute serialization   │                               │
│  │  - boolean attributes        │                               │
│  └─────────────────────────────┘                               │
│                                                                  │
│  ┌─────────────────────────────┐                               │
│  │      createElement()        │ ◄── 动态元素创建               │
│  │                             │                               │
│  │  ssrElement(tag, attrs, children)                           │
│  └─────────────────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       ssr/template.js                           │
│                      (SSR 模板生成)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ createTemplate()│ ◄── 生成 SSR 代码                          │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────┐               │
│  │  生成的代码:                                  │               │
│  │                                              │               │
│  │  import { ssr, ssrElement } from "solid-js/web";            │
│  │                                              │               │
│  │  export const _tmpl = ssr(`<div>...</div>`);                │
│  │                                              │               │
│  │  // 动态元素:                                 │               │
│  │  ssrElement("div", { id: dynamicId }, [...]);               │
│  │                                              │               │
│  └─────────────────────────────────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 4.5 Universal Renderer 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     universal/element.js                        │
│                    (通用元素转换 - 跨平台)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ transformElement│ ◄── 抽象元素处理                           │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────┐                               │
│  │        setAttr()             │                               │
│  │                             │                               │
│  │  - generateSetter()         │ ◄── 生成 setter 调用          │
│  │  - property vs attribute    │                               │
│  │  - boolean handling          │                               │
│  └─────────────────────────────┘                               │
│                                                                  │
│  ┌─────────────────────────────┐                               │
│  │   transformChildren()       │ ◄── 递归处理子节点             │
│  └─────────────────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                     universal/template.js                      │
│                     (通用模板生成)                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐                                            │
│  │ createTemplate()│ ◄── 生成抽象 API 调用                       │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────┐               │
│  │  生成的代码:                                  │               │
│  │                                              │               │
│  │  import { createElement, setProp } from "solid-js";          │
│  │                                              │               │
│  │  const _el = createElement("div");           │               │
│  │  setProp(_el, "className", "container");      │               │
│  │  // 动态:                                    │               │
│  │  createRenderEffect(() =>                    │               │
│  │    setProp(_el, "className", state.class)    │               │
│  │  );                                          │               │
│  │                                              │               │
│  └─────────────────────────────────────────────┘               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. 核心模块详解

### 5.1 入口模块 (`src/index.ts`)

```typescript
import SyntaxJSX from "@babel/plugin-syntax-jsx";
import { transformJSX } from "./shared/transform";
import postprocess from "./shared/postprocess";
import preprocess from "./shared/preprocess";
import type { Visitor } from "@babel/core";

export default (): {
  name: string;
  inherits: any;
  visitor: Visitor<{ opts: any }>;
} => {
  return {
    name: "JSX DOM Expressions",
    inherits: SyntaxJSX.default,
    visitor: {
      JSXElement: transformJSX,
      JSXFragment: transformJSX,
      Program: {
        enter: preprocess,
        exit: postprocess
      }
    }
  };
};
```

**职责**:
- 定义 Babel 插件的入口
- 配置 visitor 访问器，处理 JSXElement、JSXFragment、Program 节点
- 继承 SyntaxJSX 语法支持

### 5.2 预处理模块 (`src/shared/preprocess.ts`)

```typescript
export default (path, state) => {
  // 1. 合并默认配置与用户配置
  state.settings = { ...defaultConfig, ...state.opts };
  
  // 2. 处理 require/import 导入源
  if (state.settings.requireImportSource) {
    // 注册需要的运行时导入
  }
};
```

**职责**:
- 在 Program 入口处执行
- 合并默认配置与用户传入选项
- 处理模块导入方式（require vs import）

### 5.3 核心转换模块 (`src/shared/transform.ts`)

```typescript
export function transformJSX(path, state) {
  // 1. 获取当前节点
  const node = path.node;
  
  // 2. 判断是元素还是 Fragment
  if (isJSXElement(node)) {
    return transformElement(path, state);
  }
  
  // 3. Fragment 处理
  return transformFragment(path, state);
}
```

**职责**:
- 分发 JSXElement 和 JSXFragment 转换
- 协调各子模块的转换逻辑
- 管理转换状态和上下文

### 5.4 元素转换模块 (`src/dom/element.js`)

核心流程：

```javascript
export function transformElement(path, state) {
  // 1. 获取标签名
  const tagName = getTagName(path);
  
  // 2. 分类元素类型
  if (isComponent(tagName)) {
    return transformComponent(path, state);
  }
  
  if (isDynamicElement(path)) {
    return createDynamicElement(path, state);
  }
  
  // 3. 静态元素处理
  return createStaticElement(path, state);
}
```

属性处理 (`setAttr`)：

| 属性类型 | 处理方式 | 示例 |
|---------|---------|------|
| `style` | 内联样式对象 | `el.style.color = value` |
| `classList` | 类名映射 | `el.classList.toggle(name, value)` |
| `className` | 直接赋值 | `el.className = value` |
| `onXxx` | 事件监听 | `el.addEventListener("click", handler)` |
| `ref` | DOM 引用 | `ref = el` |
| `svg:*` | SVG 属性 | `el.setAttribute("fill", value)` |
| `bool:*` | 布尔属性 | `el.toggleAttribute(name, value)` |

### 5.5 组件转换模块 (`src/shared/component.js`)

```javascript
export function transformComponent(path, state) {
  // 1. 提取 props
  const { props, events } = extractProps(path);
  
  // 2. 合并默认 props
  const mergedProps = mergeProps(props);
  
  // 3. 生成组件调用
  return `
    (() => {
      const _props = mergeProps(${JSON.stringify(defaultProps)}, {
        ${props.map(p => `${p.name}: ${p.value}`).join(',\n')}
      });
      return ${componentName}(_props);
    })()
  `;
}
```

### 5.6 后处理模块 (`src/shared/postprocess.ts`)

```typescript
export default (path, state) => {
  // 1. 注册运行时导入
  registerImports(state);
  
  // 2. 追加模板变量声明
  appendTemplates(state);
  
  // 3. 验证 HTML 有效性
  if (state.settings.validate) {
    validateHTML(state);
  }
};
```

### 5.7 工具模块 (`src/shared/utils.ts`)

关键函数：

| 函数 | 功能 | 使用场景 |
|------|------|----------|
| `registerImportMethod()` | 注册运行时导入 | 需要使用某个函数时调用 |
| `getConfig()` | 获取配置 | 各转换函数中获取配置 |
| `getTagName()` | 获取标签名 | 元素转换时获取标签 |
| `isComponent()` | 判断组件 | 分发转换逻辑 |
| `isDynamic()` | 判断动态表达式 | 判断是否需要包装 effect |
| `filterChildren()` | 过滤子节点 | 获取有效子节点 |
| `escapeHTML()` | HTML 转义 | SSR 模式属性转义 |
| `toEventName()` | 事件名转换 | `onClick` → `click` |
| `toPropertyName()` | 属性名转换 | `className` → `class` |

---

## 6. 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `moduleName` | `string` | `"dom"` | 运行时模块名称 |
| `generate` | `string` | `"dom"` | 生成模式: `dom` / `ssr` / `universal` |
| `hydratable` | `boolean` | `false` | 是否生成支持 hydration 的代码 |
| `delegateEvents` | `boolean` | `true` | 是否启用事件委托 |
| `delegatedEvents` | `string[]` | `[]` | 需要委托的额外事件列表 |
| `builtIns` | `string[]` | `[]` | 内置组件列表（不作为组件处理） |
| `requireImportSource` | `boolean` | `false` | 是否使用 require 导入运行时 |
| `wrapConditionals` | `boolean` | `true` | 是否包装条件表达式 |
| `omitNestedClosingTags` | `boolean` | `false` | 是否省略嵌套闭合标签 |
| `omitLastClosingTag` | `boolean` | `true` | 是否省略最后一个闭合标签 |
| `omitQuotes` | `boolean` | `true` | 属性引号是否可选时省略 |
| `contextToCustomElements` | `boolean` | `false` | 是否传递上下文到自定义元素 |
| `staticMarker` | `string` | `"@once"` | 静态标记注释文本 |
| `effectWrapper` | `string` | `"effect"` | 副作用包装函数名 |
| `memoWrapper` | `string` | `"memo"` | 记忆化包装函数名 |
| `validate` | `boolean` | `true` | 是否验证生成的 HTML |
| `inlineStyles` | `boolean` | `true` | 是否内联样式对象 |

---

## 7. 特殊绑定语法

### 7.1 绑定类型总览

| 绑定语法 | 功能 | 示例 |
|---------|------|------|
| `on:*` | 手动事件监听 | `<div on:click={handler} />` |
| `class:*` | 条件类名 | `<div class:active={isActive} />` |
| `style:*` | 样式属性 | `<div style:color={color} />` |
| `prop:*` | 属性传递 | `<div prop:value={value} />` |
| `bool:*` | 布尔属性 | `<input bool:disabled={disabled} />` |
| `ref` | DOM 引用 | `<div ref={el} />` |
| `use:*` | 自定义指令 | `<div use:action={fn} />` |
| `classList` | 类名映射对象 | `<div classList={{active: isActive}} />` |
| `spread` | 属性展开 | `<div {...props} />` |

### 7.2 详细说明

#### 7.2.1 事件绑定 (`on:*`)

```jsx
// 输入
<div on:click={handleClick} on:mouseenter={handleEnter} />

// 输出
_el.addEventListener("click", handleClick);
_el.addEventListener("mouseenter", handleEnter);
```

#### 7.2.2 类名绑定 (`class:*`)

```jsx
// 输入
<button class:primary={isPrimary} class:disabled={isDisabled} />

// 输出
className = `${isPrimary ? "primary" : ""} ${isDisabled ? "disabled" : ""}`.trim() || null;
```

#### 7.2.3 样式绑定 (`style:*`)

```jsx
// 输入
<div style:color="red" style:fontSize={size} />

// 输出
_el.style.color = "red";
_el.style.fontSize = size + "px";
```

#### 7.2.4 ClassList 对象

```jsx
// 输入
<div classList={{ active: isActive, disabled: isDisabled }} />

// 输出
_createRenderEffect(() => {
  _el.classList.toggle("active", isActive());
  _el.classList.toggle("disabled", isDisabled());
});
```

#### 7.2.5 属性展开

```jsx
// 输入
<div {...props} class="base" />

// 输出
 Object.assign(_el, props);
_el.class = "base";
```

---

## 8. 转换示例

### 8.1 简单静态元素

```jsx
// 输入
<div className="container">
  <h1>Hello World</h1>
</div>

// DOM 输出
import { template as _template } from "solid-js/web";
const _tmpl = _template(`<div class="container"><h1>Hello World</h1></div>`);
```

### 8.2 动态属性

```jsx
// 输入
<div id={state.id} className={state.class}>
  <span>{state.name}</span>
</div>

// DOM 输出
import { template as _template, insert as _insert, createRenderEffect as _createRenderEffect } from "solid-js/web";

const _tmpl = _template(`<div><span></span></div>`);

function _createComponent() {
  const _el = _tmpl.cloneNode(true);
  const _span = _el.firstChild;
  
  _createRenderEffect(() => _el.id = state.id);
  _createRenderEffect(() => _el.className = state.class);
  _createRenderEffect(() => _insert(_span, state.name));
  
  return _el;
}
```

### 8.3 事件处理

```jsx
// 输入
<button onClick={handleClick} disabled={isLoading}>
  {isLoading ? 'Loading...' : 'Submit'}
</button>

// DOM 输出
import { template, insert, delegateEvents } from "solid-js/web";

delegateEvents(["click"]);

const _tmpl = template(`<button></button>`);

function _createComponent() {
  const _el = _tmpl.cloneNode(true);
  
  _el.addEventListener("click", handleClick);
  
  createRenderEffect(() => {
    _el.disabled = isLoading();
  });
  
  createRenderEffect(() => {
    insert(_el, () => isLoading() ? 'Loading...' : 'Submit');
  });
  
  return _el;
}
```

### 8.4 条件渲染

```jsx
// 输入
{state.show && <div>Content</div>}

// DOM 输出
createRenderEffect(() => {
  if (state.show) {
    insert(_parent, () => <div>Content</div>);
  }
});
```

### 8.5 列表渲染

```jsx
// 输入
<ul>
  {state.items.map((item, i) => (
    <li key={i}>{item.name}</li>
  ))}
</ul>

// DOM 输出
import { For } from "solid-js";

const _tmpl = template(`<ul></ul>`);

function _createComponent() {
  const _el = _tmpl.cloneNode(true);
  
  insert(_el, () => For(state.items, (item, i) => (
    <li>{item.name}</li>
  )));
  
  return _el;
}
```

### 8.6 组件

```jsx
// 输入
<MyCard title={state.title} onUpdate={handleUpdate}>
  <p>Content</p>
</MyCard>

// DOM 输出
import { mergeProps } from "solid-js";

function _createComponent() {
  const _props = mergeProps({ 
    onUpdate: handleUpdate 
  }, props);
  
  const _el = MyCard({
    ..._props,
    children: () => <p>Content</p>
  });
  
  return _el;
}
```

### 8.7 SSR 模式

```jsx
// 输入
<div className={state.class}>{state.content}</div>

// SSR 输出
import { ssr } from "solid-js/web";

const _tmpl = ssr(`<div class="${escape(state.class)}">${escape(state.content)}</div>`);
```

---

## 9. 文件结构

```
babel-plugin-jsx-dom-expressions/
├── src/
│   ├── index.ts              # 插件主入口
│   ├── config.ts             # 默认配置
│   ├── VoidElements.ts       # 自闭合元素列表
│   ├── external.d.ts         # Babel 类型声明
│   │
│   ├── dom/                  # DOM 渲染模式
│   │   ├── constants.js      # 元素分类常量
│   │   ├── element.js        # DOM 元素转换 (1372行)
│   │   └── template.js        # DOM 模板生成 (228行)
│   │
│   ├── ssr/                  # SSR 渲染模式
│   │   ├── element.js        # SSR 元素转换 (628行)
│   │   └── template.js        # SSR 模板生成 (75行)
│   │
│   ├── universal/            # 通用渲染模式
│   │   ├── element.js        # 通用元素转换 (396行)
│   │   └── template.js       # 通用模板生成 (108行)
│   │
│   └── shared/               # 共享模块
│       ├── postprocess.js     # 后处理 (46行)
│       ├── preprocess.js      # 预处理 (23行)
│       ├── component.js       # 组件转换 (325行)
│       ├── fragment.js        # Fragment 转换 (19行)
│       ├── utils.js           # 工具函数 (482行)
│       ├── validate.js        # HTML 验证 (97行)
│       └── transform.js       # 核心转换逻辑 (240行)
│
├── test/                      # 测试用例
│   ├── __dom_fixtures__/     # DOM 模式测试用例
│   ├── __ssr_fixtures__/     # SSR 模式测试用例
│   ├── __universal_fixtures__/ # Universal 模式测试用例
│   ├── dynamic.spec.js       # 动态特性测试
│   ├── ssr.spec.js           # SSR 测试
│   └── universal.spec.js     # Universal 测试
│
├── package.json
├── rollup.config.js
├── tsconfig.json
├── jest.config.js
└── README.md
```

---

## 10. 总结

`babel-plugin-jsx-dom-expressions` 是一个精心设计的 JSX 编译器，通过以下方式实现高效的 DOM 操作：

### 10.1 核心优势

1. **模板复用**: 静态 HTML 只创建一次，通过 `cloneNode` 复用
2. **细粒度更新**: 每个动态属性独立追踪，避免不必要的重渲染
3. **事件委托**: 减少事件监听器数量，提高性能
4. **静态提升**: 静态内容在编译时确定，不参与运行时计算

### 10.2 设计模式

1. **策略模式**: 三种渲染器 (DOM/SSR/Universal) 可互换
2. **访问者模式**: Babel visitor 遍历 AST 节点
3. **工厂模式**: `createTemplate` 根据配置生成不同代码
4. **注册模式**: `registerImportMethod` 延迟注册导入

### 10.3 性能优化

- 模板静态部分预编译
- 动态部分使用 `createRenderEffect` 追踪
- 事件委托减少监听器数量
- `createMemo` 缓存计算结果
