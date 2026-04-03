# dom-expressions 语法编译路线详尽文档

> 基于 `babel-plugin-jsx-dom-expressions` 代码库的完整语法转换分析
>
> **注意**：本文件纯粹记录 `dom-expressions`（SolidJS 的 JSX 编译器）的编译行为，不包含任何 Zeus 框架相关内容。

---

## 目录

- [1. 概述](#1-概述)
- [2. 基础语法编译路线](#2-基础语法编译路线)
- [3. 属性绑定编译路线](#3-属性绑定编译路线)
- [4. 事件处理编译路线](#4-事件处理编译路线)
- [5. 条件渲染编译路线](#5-条件渲染编译路线)
- [6. 列表渲染编译路线](#6-列表渲染编译路线)
- [7. 组件编译路线](#7-组件编译路线)
- [8. 特殊语法编译路线](#8-特殊语法编译路线)
- [9. SSR 模式编译路线](#9-ssr-模式编译路线)
- [10. Fragment 编译路线](#10-fragment-编译路线)
- [11. 编译优化策略](#11-编译优化策略)
- [附录 A：编译决策表](#附录-a编译决策表)
- [附录 B：运行时函数映射](#附录-b运行时函数映射)
- [附录 C：关键配置选项](#附录-c关键配置选项)

---

## 1. 概述

### 1.1 文档目的

本文档详细记录 `dom-expressions`（SolidJS 的 JSX 编译器）中每种 JSX 语法的编译转换路线，涵盖：
- 输入语法（JSX）
- 输出代码（JavaScript）
- 核心算法说明
- 编译决策逻辑

### 1.2 编译模式

| 模式 | 配置值 | 说明 | 典型输出 |
|------|--------|------|----------|
| **DOM** | `generate: "dom"` | 客户端渲染，生成模板复用代码 | `_$template()`, `_$insert()`, `_$effect()` |
| **SSR** | `generate: "ssr"` | 服务端渲染，生成 HTML 字符串 | `_$ssr()`, `_$ssrElement()`, `_$escape()` |
| **Universal** | `generate: "universal"` | 跨平台抽象 | `createElement()`, `setProp()` |

### 1.3 导入模块

编译器通过配置 `moduleName` 确定运行时模块路径，默认从 `"dom"` 包导入：

```javascript
// 默认导入（moduleName: "dom"）
import { template as _$template, insert as _$insert, effect as _$effect } from "dom";

// 自定义导入（moduleName: "solid-js/web"）
import { template as _$template, insert as _$insert } from "solid-js/web";
```

### 1.4 核心概念

#### 动态性检测 (`isDynamic`)

编译器通过 `isDynamic()` 函数判断表达式是否为动态的：

```javascript
// 判定规则
isDynamic(expr, options) {
  const { checkMember, checkCallExpressions, checkTags } = options || {};
  
  // 1. 函数表达式 → 静态（事件处理器、组件函数）
  if (isFunction(expr)) return false;
  
  // 2. @once 注释标记 → 静态
  if (expr.leadingComments?.value.includes("@once")) return false;
  
  // 3. 函数调用 → 动态
  if (checkCallExpressions && isCallExpression(expr)) return true;
  
  // 4. 成员访问 → 动态
  if (checkMember && isMemberExpression(expr)) return true;
  
  // 5. JSX 元素/片段 → 动态
  if (checkTags && isJSXElement(expr)) return true;
  
  // 6. 深度遍历查找
  let dynamic = false;
  expr.traverse({
    CallExpression() { dynamic = true; },
    MemberExpression() { dynamic = true; },
    JSXElement() { dynamic = true; }
  });
  return dynamic;
}
```

#### 元素类型判断

```javascript
function isComponent(tagName) {
  return (
    // 首字母大写 → 组件
    tagName[0] && tagName[0] !== tagName[0].toLowerCase()
    // 包含点号 → 属性访问组件
    || tagName.includes(".")
    // 非字母开头 → 组件
    || !/^[a-zA-Z]/.test(tagName)
  );
}
```

---

## 2. 基础语法编译路线

### 2.1 静态 HTML 元素

**输入**：

```jsx
<div class="container">
  <h1>Hello World</h1>
  <p>This is static content</p>
</div>
```

**DOM 模式输出**：

```javascript
import { template as _$template } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<div class="container"><h1>Hello World</h1><p>This is static content</p></div>`);
```

**编译决策**：
- 所有子节点和属性都是静态的
- 直接生成 HTML 模板字符串
- 使用 `/*#__PURE__*/` 标注纯函数

**模板函数实现**：

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

### 2.2 动态文本节点

**输入**：

```jsx
<div>{name}</div>
```

**DOM 模式输出**：

```javascript
import { template as _$template, insert as _$insert } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<div><!----></div>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  _$insert(_el, name);
  return _el;
};
```

**关键点**：
- 动态文本在模板中用 `<!---->` 占位（comment marker）
- 使用 `insert()` 函数插入动态值
- `_tmpl` 的第二个参数 `1` 表示有一个 marker 占位符
- 动态值直接传入 `insert()`，不需要包装为 getter 函数

**`insert()` 函数实现**：

```javascript
export function insert(parent, accessor, marker, current) {
  // accessor 不是函数 → 一次性插入
  if (typeof accessor !== "function") {
    return appendNodes(parent, accessor, current);
  }
  // accessor 是函数 → 创建 effect 追踪依赖
  effect(current => insertExpression(parent, accessor(), current, marker), current);
}

function insertExpression(parent, value, current, marker) {
  const t = typeof value;
  if (t === "string" || t === "number") {
    if (current) {
      // 已有文本节点 → 更新
      if (current.nodeType === 3) {
        current.data !== value && (current.data = value);
        return current;
      }
    }
    // 创建新文本节点
    const node = document.createTextNode(value);
    return appendNodes(parent, node, current, marker);
  } else if (Array.isArray(value)) {
    // 数组 → 协调
    reconcileArrays(parent, current, value);
  } else if (value != null && value.nodeType) {
    // DOM 节点
    if (current) {
      parent.replaceChild(value, current);
    } else {
      parent.appendChild(value);
    }
  }
  return value;
}
```

### 2.3 多个相邻动态文本

**输入**：

```jsx
<div>{firstName} {lastName}</div>
```

**DOM 模式输出**：

```javascript
const _tmpl = /*#__PURE__*/_$template(`<div><!----> <!----></div>`, 2);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  _$insert(_el, firstName);
  _$insert(_el, lastName);
  return _el;
};
```

**优化策略**：
- 静态空格 ` ` 保留在模板中
- 每个动态表达式各自使用一个 marker

### 2.4 混合静态和动态文本

**输入**：

```jsx
<div>Welcome, {user.name}!</div>
```

**DOM 模式输出**：

```javascript
const _tmpl = /*#__PURE__*/_$template(`<div>Welcome, <!---->!</div>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  _$insert(_el, () => user.name);  // 成员访问是动态的
  return _el;
};
```

**关键点**：
- 静态文本 "Welcome, " 和 "!" 被保留在模板中
- 只有 `<!---->` 部分需要动态计算
- 成员访问 `user.name` 被包装为函数 `() => user.name`

---

## 3. 属性绑定编译路线

### 3.1 静态属性

**输入**：

```jsx
<div id="app" class="container" data-value="test">
  <img src="/logo.png" alt="Logo" />
</div>
```

**DOM 模式输出**：

```javascript
// 所有静态属性都写入模板字符串
const _tmpl = /*#__PURE__*/_$template(`<div id="app" class="container" data-value="test"><img src="/logo.png" alt="Logo"/></div>`);
```

**编译决策**：
- 静态属性直接写入 HTML 模板
- 不生成任何运行时代码
- 完全零开销

### 3.2 动态属性绑定

**输入**：

```jsx
<div class={className} id={elementId} />
```

**DOM 模式输出**：

```javascript
import { template as _$template, className as _$className } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<div></div>`, 2);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // 动态属性直接调用，不需要 effect() 包裹
  _$className(_el, () => className());
  _$setAttribute(_el, "id", () => elementId());
  return _el;
};
```

**编译决策**：
- **动态属性在模板克隆函数体内同步调用**，不包装为 `effect`
- 模板中 `2` 表示有两个动态占位符
- 编译时就知道这些是动态属性，直接生成调用代码

**`setAttribute()` 函数**：

```javascript
export function setAttribute(node, name, value) {
  if (isHydrating(node)) return;
  if (value == null) {
    node.removeAttribute(name);
  } else {
    node.setAttribute(name, value);
  }
}
```

### 3.3 布尔属性

**输入**：

```jsx
<input type="checkbox" checked={isChecked} disabled={isDisabled} />
```

**DOM 模式输出**：

```javascript
import { template as _$template, setAttribute as _$setAttribute } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<input type="checkbox"/>`, 2);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // checked 和 disabled 是布尔属性，使用空字符串表示 true
  _$setAttribute(_el, "checked", () => isChecked());
  _$setAttribute(_el, "disabled", () => isDisabled());
  return _el;
};
```

**常见布尔属性**：

```javascript
const BooleanAttributes = new Set([
  "allowfullscreen", "async", "autofocus", "checked", "controls",
  "default", "defer", "disabled", "formnovalidate", "hidden",
  "ismap", "loop", "multiple", "muted", "nomodule", "novalidate",
  "open", "playsinline", "readonly", "required", "reversed",
  "seamless", "selected"
]);
```

### 3.4 DOM 属性 (Property)

**输入**：

```jsx
<input value={inputValue} />
<div innerHTML={htmlContent} />
```

**DOM 模式输出**：

```javascript
const _tmpl = /*#__PURE__*/_$template(`<input/>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // DOM 属性直接赋值，不使用 setAttribute
  _el.value = () => inputValue();
  return _el;
};
```

**编译决策**：
- `value`、`innerHTML`、`className` 等 DOM 属性使用直接赋值
- 避免使用 `setAttribute`，更高效

**DOM 属性列表**：

```javascript
const Properties = new Set([
  "className", "classList", "id", "value", "checked", "selected",
  "innerHTML", "textContent", "innerText", "children",
  "scrollTop", "scrollLeft", "clientTop", "clientLeft",
  "readOnly", "disabled"
]);
```

### 3.5 style 内联样式对象

**输入**：

```jsx
<div style={{ color: "red", fontSize: "14px" }} />
```

**DOM 模式输出**：

```javascript
import { template as _$template, style as _$style } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<div></div>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  _$style(_el, () => ({ color: "red", fontSize: "14px" }));
  return _el;
};
```

**`style()` 函数实现**：

```javascript
export function style(el, value) {
  if (typeof value === "string") {
    el.style.cssText = value;
  } else {
    // 对象形式：camelCase 转换为 kebab-case
    for (const key in value) {
      el.style.setProperty(
        key.replace(/[A-Z]/g, m => "-" + m.toLowerCase()),
        value[key]
      );
    }
  }
}
```

### 3.6 style:* 命名空间绑定

**输入**：

```jsx
<div style:color={textColor} style:fontSize={fontSize} />
```

**DOM 模式输出**：

```javascript
const App = () => {
  const _el = _tmpl.cloneNode(true);
  // style:xxx 语法直接设置 style 属性
  _$style(_el, "color", () => textColor());
  _$style(_el, "fontSize", () => fontSize());
  return _el;
};
```

### 3.7 classList 对象

**输入**：

```jsx
<div classList={{ active: isActive, disabled: isDisabled }} />
```

**DOM 模式输出**：

```javascript
import { template as _$template, classList as _$classList } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<div></div>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  _$classList(_el, { active: isActive, disabled: isDisabled });
  return _el;
};
```

**`classList()` 函数实现**：

```javascript
export function classList(el, value) {
  for (const key in value) {
    if (value[key]) {
      el.classList.add(key);
    } else {
      el.classList.remove(key);
    }
  }
}
```

### 3.8 class:* 命名空间绑定

**输入**：

```jsx
<button class:active={isActive} class:loading={isLoading}>Click</button>
```

**DOM 模式输出**：

```javascript
const App = () => {
  const _el = _tmpl.cloneNode(true);
  // class:xxx 使用 classList.toggle
  _el.classList.toggle("active", () => isActive());
  _el.classList.toggle("loading", () => isLoading());
  return _el;
};
```

### 3.9 混合 class 属性

**输入**：

```jsx
<div class="base" class:active={isActive}>{name}</div>
```

**DOM 模式输出**：

```javascript
const _tmpl = /*#__PURE__*/_$template(`<div class="base"><!----></div>`, 2);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // 静态 class="base" 在模板中，动态 class:active 使用 toggle
  _el.classList.toggle("active", () => isActive());
  _$insert(_el, name);
  return _el;
};
```

### 3.10 属性展开 (Spread)

**输入**：

```jsx
<div {...attrs} class="override">{children}</div>
```

**DOM 模式输出**：

```javascript
import { template as _$template, mergeProps as _$mergeProps, spreadProps as _$spreadProps } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<div><!----></div>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // 使用 mergeProps 合并 attrs 和 override
  const _props = _$mergeProps([attrs, { class: "override" }]);
  _$spreadProps(_el, _props);
  _$insert(_el, children);
  return _el;
};
```

---

## 4. 事件处理编译路线

### 4.1 事件委托机制概述

```
┌─────────────────────────────────────────────────────────────┐
│                    事件委托架构                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   用户点击 button#btn                                         │
│          │                                                   │
│          ▼                                                   │
│   ┌─────────────────┐                                        │
│   │  document       │  ← 只在 document 注册一个监听器         │
│   │  addEventListener│                                        │
│   │  ("click", ...) │                                        │
│   └────────┬────────┘                                        │
│            │                                                  │
│            ▼                                                  │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  事件冒泡: document → ... → button#btn               │    │
│   └─────────────────────────────────────────────────────┘    │
│            │                                                  │
│            ▼                                                  │
│   ┌─────────────────────────────────────────────────────┐    │
│   │  事件处理器: 检查 e.target 是否带有 $$click 属性      │    │
│   │  e.target.$$click?.(e)                              │    │
│   └─────────────────────────────────────────────────────┘    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 可委托事件列表

```javascript
const DelegatedEvents = new Set([
  "beforeinput", "click", "dblclick", "contextmenu",
  "focusin", "focusout", "input", "keydown", "keyup",
  "mousedown", "mousemove", "mouseout", "mouseover", "mouseup",
  "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup",
  "touchend", "touchmove", "touchstart"
]);
```

### 4.3 标准事件绑定

**输入**：

```jsx
<button onClick={handleClick}>Click me</button>
```

**DOM 模式输出**：

```javascript
import { template as _$template, delegateEvents as _$delegateEvents } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<button>Click me</button>`);

_$delegateEvents(["click"]);  // 全局注册，只注册一次

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // 事件处理器存储在元素的 $$属性名 上
  _el.$$click = handleClick;
  return _el;
};
```

**编译决策**：
- `onClick` → `click`（小写）
- 事件处理器赋值给元素的 `$$click` 属性
- `delegateEvents` 在模块级别调用一次，后续不重复注册

**`delegateEvents()` 函数实现**：

```javascript
const $$EVENTS = Symbol("events");

export function delegateEvents(eventNames, document = window.document) {
  const events = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  
  for (const name of eventNames) {
    if (!events.has(name)) {
      events.add(name);
      // 只注册一次
      document.addEventListener(name, handleDelegatedEvent);
    }
  }
}

function handleDelegatedEvent(e) {
  let node = e.target;
  const key = `$$${e.type}`;
  
  // 向上遍历 DOM 树，查找带处理器且未禁用的节点
  while (node && !(node.disabled && node[key])) {
    const handler = node[key];
    if (handler) {
      handler.call(node, e);
      return;
    }
    node = node.parentNode;
  }
}
```

### 4.4 非委托事件 (on:* 语法)

**输入**：

```jsx
<div on:click={handleClick} />
```

**DOM 模式输出**：

```javascript
import { addEventListener as _$addEventListener } from "dom";

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // on:xxx 语法不使用委托，直接 addEventListener
  _el.addEventListener("click", handleClick);
  return _el;
};
```

**何时不使用委托**：
- `on:*` 语法明确要求直接绑定
- `focus`/`blur` 事件
- 自定义事件

### 4.5 事件传参 (data-*)

**输入**：

```jsx
<ul>
  {items.map(item => (
    <li onClick={[handleClick, item.id]}>{item.name}</li>
  ))}
</ul>
```

**DOM 模式输出**：

```javascript
const _tmpl = /*#__PURE__*/_$template(`<ul><li><!----></li></ul>`);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  
  // 数据存储在特殊属性中
  _el.$$clickData = item.id;
  _el.$$click = (e) => handleClick(item.id, e);
  
  return _el;
};
```

### 4.6 事件处理完整示例

**输入**：

```jsx
function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div>
      <button onClick={() => setCount(c => c + 1)}>
        Count: {count()}
      </button>
      <input 
        onInput={handleInput}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    </div>
  );
}
```

**DOM 模式输出**：

```javascript
import { template as _$template, insert as _$insert, delegateEvents as _$delegateEvents } from "dom";

_$delegateEvents(["click", "focus", "blur", "input"]);

const _tmpl$ = /*#__PURE__*/_$template(`<div><button>Count: <!----></button><input/></div>`, 1);

const App = () => {
  const _el = _tmpl$.cloneNode(true);
  const _btn = _el.firstChild;
  const _input = _btn.nextSibling;
  
  // 动态内容
  _$insert(_btn, count);
  
  // 事件绑定
  _btn.$$click = () => setCount(c => c + 1);
  _input.$$input = handleInput;
  _input.$$focus = handleFocus;
  _input.$$blur = handleBlur;
  
  return _el;
};
```

---

## 5. 条件渲染编译路线

### 5.1 三元表达式

**输入**：

```jsx
<div>
  {flag ? <span>True</span> : <span>False</span>}
</div>
```

**DOM 模式输出**：

```javascript
import { template as _$template, insert as _$insert } from "dom";

const _tmpl$ = /*#__PURE__*/_$template(`<div><!----></div>`, 1);

const App = () => {
  const _el = _tmpl$.cloneNode(true);
  _$insert(_el, () => flag() 
    ? (() => {
        const _span = document.createElement("span");
        _span.textContent = "True";
        return _span;
      })()
    : (() => {
        const _span = document.createElement("span");
        _span.textContent = "False";
        return _span;
      })()
  );
  return _el;
};
```

### 5.2 && 逻辑与

**输入**：

```jsx
<div>
  {isLoading && <Spinner />}
  {data && <Content data={data} />}
</div>
```

**DOM 模式输出**：

```javascript
const _tmpl$ = /*#__PURE__*/_$template(`<div><!----><!----></div>`, 2);

const App = () => {
  const _el = _tmpl$.cloneNode(true);
  
  // Spinner
  _$insert(_el, () => isLoading() && (() => {
    const _el$ = document.createElement("div");
    _el$.className = "spinner";
    return _el$;
  })());
  
  // Content
  _$insert(_el, () => data() && (() => {
    return (() => { /* _Content component */ })();
  })());
  
  return _el;
};
```

### 5.3 嵌套条件

**输入**：

```jsx
<div>
  {a ? (
    <span>A</span>
  ) : b ? (
    <span>B</span>
  ) : (
    <span>C</span>
  )}
</div>
```

**DOM 模式输出**：

```javascript
_$insert(_el, () => a() 
  ? (() => { const _el$ = document.createElement("span"); _el$.textContent = "A"; return _el$; })()
  : b()
    ? (() => { const _el$ = document.createElement("span"); _el$.textContent = "B"; return _el$; })()
    : (() => { const _el$ = document.createElement("span"); _el$.textContent = "C"; return _el$; })()
);
```

### 5.4 null/undefined 条件

**输入**：

```jsx
<div>{value || null}</div>
```

**DOM 模式输出**：

```javascript
_$insert(_el, () => value() || null);
```

### 5.5 Show 组件模式

**输入**：

```jsx
<Show when={isLoggedIn} fallback={<Login />}>
  <Dashboard />
</Show>
```

**编译输出**：

```javascript
// 使用 <Show> 组件处理复杂条件
_$insert(_el, () => _Show(isLoggedIn, {
  children: () => _Dashboard(),
  fallback: () => _Login()
}));
```

---

## 6. 列表渲染编译路线

### 6.1 基本 map

**输入**：

```jsx
<ul>
  {items.map(item => <li>{item}</li>)}
</ul>
```

**DOM 模式输出**：

```javascript
import { For as _$For } from "dom";

const _tmpl = /*#__PURE__*/_$template(`<ul></ul>`);
const _tmpl$ = /*#__PURE__*/_$template(`<li><!----></li>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  _$insert(_el, () => _$For(items, item => {
    const _li = _tmpl$.cloneNode(true);
    _$insert(_li, item);
    return _li;
  }));
  return _el;
};
```

**关键点**：
- 外层 `<ul>` 是一个模板
- 内层 `<li>` 是另一个模板
- 列表渲染使用 `For` 组件或原生 `.map()`
- 列表项的模板在循环外创建，循环内使用 `cloneNode(true)` 复用

### 6.2 带索引的 map

**输入**：

```jsx
{items.map((item, index) => (
  <li key={index}>{item}</li>
))}
```

**DOM 模式输出**：

```javascript
_$insert(_parent, () => items().map((item, index) => {
  const _tmpl$ = /*#__PURE__*/_$template(`<li><!----></li>`, 1);
  const _li = _tmpl$.cloneNode(true);
  _$insert(_li, item);
  return _li;
}));
```

### 6.3 嵌套列表

**输入**：

```jsx
<ul>
  {categories.map(cat => (
    <li>
      {cat.name}
      <ul>
        {cat.items.map(item => <li>{item}</li>)}
      </ul>
    </li>
  ))}
</ul>
```

**DOM 模式输出**：

```javascript
const _tmpl = /*#__PURE__*/_$template(`<ul></ul>`);
const _tmpl$ = /*#__PURE__*/_$template(`<li><!----><ul></ul></li>`, 2);
const _tmpl$$ = /*#__PURE__*/_$template(`<li><!----></li>`, 1);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  
  _$insert(_el, () => categories().map(cat => {
    const _li = _tmpl$.cloneNode(true);
    const _name = _li.firstChild;
    const _ul = _name.nextSibling;
    
    _$insert(_name, () => cat.name);
    _$insert(_ul, () => cat.items().map(item => {
      const _li$ = _tmpl$$.cloneNode(true);
      _$insert(_li$, item);
      return _li$;
    }));
    
    return _li;
  }));
  
  return _el;
};
```

### 6.4 For 组件模式

**输入**：

```jsx
<For each={items}>
  {(item, index) => <li>{index}: {item}</li>}
</For>
```

**编译输出**：

```javascript
import { For as _$For } from "dom";

const _tmpl$ = /*#__PURE__*/_$template(`<li><!---->: <!----></li>`, 2);

_$insert(_parent, () => _$For(items, (item, index) => {
  const _li = _tmpl$.cloneNode(true);
  _$insert(_li, index);
  _$insert(_li, item);
  return _li;
}));
```

---

## 7. 组件编译路线

### 7.1 函数组件

**输入**：

```jsx
function Card({ title, children }) {
  return (
    <div class="card">
      <h1>{title}</h1>
      <div>{children}</div>
    </div>
  );
}

// 使用
<Card title="Hello"><p>Content</p></Card>
```

**DOM 模式输出**：

```javascript
import { template as _$template, mergeProps as _$mergeProps, createComponent as _$createComponent, insert as _$insert } from "dom";

function Card(props) {
  const _tmpl = /*#__PURE__*/_$template(`<div class="card"><h1><!----></h1><div><!----></div></div>`, 2);
  const _el = _tmpl.cloneNode(true);
  
  // 解构 props（mergeProps 确保不可变性）
  const _props = _$mergeProps(props);
  const _h1 = _el.firstChild;
  const _content = _h1.nextSibling;
  
  _$insert(_h1, () => _props.title());
  _$insert(_content, () => _props.children());
  
  return _el;
}

// 使用处
const App = () => {
  const _tmpl$ = /*#__PURE__*/_$template(`<div><!----></div>`, 1);
  const _el = _tmpl$.cloneNode(true);
  
  _$insert(_el, () => _$createComponent(Card, _$mergeProps(() => ({ 
    title: "Hello" 
  }), {
    children: () => (() => {
      const _p = document.createElement("p");
      _p.textContent = "Content";
      return _p;
    })()
  }))));
  
  return _el;
};
```

### 7.2 组件属性传递

**输入**：

```jsx
<Button 
  variant="primary" 
  size={size}
  onClick={handleClick}
  disabled={isLoading}
/>
```

**DOM 模式输出**：

```javascript
import { template as _$template, mergeProps as _$mergeProps, createComponent as _$createComponent } from "dom";

const App = () => {
  const _tmpl$ = /*#__PURE__*/_$template(`<!---->`, 1);
  const _el = _tmpl$.cloneNode(true);
  
  _$insert(_el, () => _$createComponent(Button, _$mergeProps(
    { variant: "primary" },  // 静态属性
    { 
      get size() { return size(); },      // 动态属性包装为 getter
      onClick: handleClick,
      get disabled() { return isLoading(); }
    }
  )));
  
  return _el;
};
```

### 7.3 组件 children

**输入**：

```jsx
<Container>
  <Header />
  <Main />
  <Footer />
</Container>
```

**编译输出**：

```javascript
import { template as _$template, createComponent as _$createComponent, insert as _$insert } from "dom";

_$insert(_parent, () => _$createComponent(Container, {
  get children() {
    return [
      _$createComponent(Header, {}),
      _$createComponent(Main, {}),
      _$createComponent(Footer, {})
    ];
  }
}));
```

### 7.4 组件事件

**输入**：

```jsx
<Form onSubmit={handleSubmit} onReset={handleReset} />
```

**编译输出**：

```javascript
import { mergeProps as _$mergeProps, createComponent as _$createComponent } from "dom";

_$insert(_parent, () => _$createComponent(Form, _$mergeProps({
  onSubmit: handleSubmit,
  onReset: handleReset
})));
```

### 7.5 动态组件

**输入**：

```jsx
<Dynamic component={CurrentComponent} props={componentProps} />
```

**编译输出**：

```javascript
import { Dynamic as _$Dynamic } from "dom";

_$insert(_parent, () => _$Dynamic({
  get component() { return CurrentComponent; },
  get props() { return componentProps; }
}));
```

### 7.6 命名空间组件

**输入**：

```jsx
<Icon name="star" />
```

**编译输出**：

```javascript
// Icon 被识别为组件（首字母大写）
_$insert(_parent, () => Icon({ name: "star" }));
```

---

## 8. 特殊语法编译路线

### 8.1 ref 属性

**输入**：

```jsx
<div ref={el => this.element = el} />
```

**DOM 模式输出**：

```javascript
import { template as _$template } from "dom";

const App = () => {
  const _el = _tmpl.cloneNode(true);
  
  // ref 回调立即执行
  (el => this.element = el)(_el);
  
  return _el;
};
```

### 8.2 use:* 自定义指令

**输入**：

```jsx
<div use:focus /> 
<div use:clickOutside={handleClickOutside} />
```

**DOM 模式输出**：

```javascript
import { use as _$use } from "dom";

const App = () => {
  const _el = _tmpl.cloneNode(true);
  
  _$use(_el, focus);
  _$use(_el, clickOutside, () => handleClickOutside());
  
  return _el;
};
```

### 8.3 prop:* 命名空间

**输入**：

```jsx
<CustomElement prop:value={value} />
```

**DOM 模式输出**：

```javascript
import { mergeProps as _$mergeProps, createComponent as _$createComponent } from "dom";

_$insert(_parent, () => _$createComponent(CustomElement, _$mergeProps({
  get ["value"]() { return value(); }
})));
```

### 8.4 bool:* 命名空间

**输入**：

```jsx
<input bool:required={isRequired} />
```

**DOM 模式输出**：

```javascript
import { setAttribute as _$setAttribute } from "dom";

const App = () => {
  const _el = _tmpl.cloneNode(true);
  
  // bool:xxx 使用 setAttribute 处理布尔值
  _$setAttribute(_el, "required", () => isRequired());
  
  return _el;
};
```

### 8.5 静态标记 (@once)

**输入**：

```jsx
{/* @once */}
<div>{dynamicValue}</div>
```

**DOM 模式输出**：

```javascript
// @once 标记的内容只计算一次，不追踪更新
const _tmpl = /*#__PURE__*/_$template(`<div><!----></div>`, 1);
const _el = _tmpl.cloneNode(true);

// 一次性设置，不包装为 effect
_el.lastChild.textContent = dynamicValue;  // 不调用
```

---

## 9. SSR 模式编译路线

SSR 模式下，编译器生成 HTML 字符串而非 DOM 操作代码。

### 9.1 静态元素 SSR

**输入**：

```jsx
<div class="container">
  <h1>Hello</h1>
</div>
```

**SSR 模式输出**：

```javascript
import { ssr as _$ssr } from "dom";

export const _tmpl = /*#__PURE__*/_$ssr(`<div class="container"><h1>Hello</h1></div>`);
```

### 9.2 动态属性 SSR

**输入**：

```jsx
<div class={className} id={elementId}>Content</div>
```

**SSR 模式输出**：

```javascript
import { ssr as _$ssr, escape as _$escape, ssrAttribute as _$ssrAttribute } from "dom";

export const _tmpl = /*#__PURE__*/_$ssr(
  `<div${() => _$$ssrAttribute("class", className())}${() => _$$ssrAttribute("id", elementId())}>${() => _$escape("Content")}</div>`
);
```

### 9.3 SSR 属性处理

```javascript
// SSR 属性处理核心逻辑
if (isDynamic(value)) {
  // 动态属性：生成运行时计算
  template.push("");
  templateValues.push(
    () => ssrAttribute(name, value(), isBoolean)
  );
} else {
  // 静态属性：直接写入模板
  template.push(` ${name}="${escape(value)}"`);
}
```

### 9.4 SSR 布尔属性

**输入**：

```jsx
<input type="checkbox" checked={isChecked} />
```

**SSR 模式输出**：

```javascript
import { ssr as _$ssr, ssrAttribute as _$ssrAttribute } from "dom";

export const _tmpl = /*#__PURE__*/_$ssr(
  `<input type="checkbox"${() => _$ssrAttribute("checked", isChecked(), true)}/>`
);
```

### 9.5 SSR classList

**输入**：

```jsx
<div classList={{ active: isActive }}>Content</div>
```

**SSR 模式输出**：

```javascript
import { ssr as _$ssr, ssrClassList as _$ssrClassList } from "dom";

export const _tmpl = /*#__PURE__*/_$ssr(
  `<div class="${() => _$ssrClassList({ active: isActive() })}">${() => _$escape("Content")}</div>`
);
```

### 9.6 SSR 水合标记

**SSR 输出的 HTML 包含水合标记**：

```javascript
// 生成的水合标记
function ssrHydrationKey() {
  const hk = getHydrationKey();
  return hk ? ` data-hk="${hk}"` : "";
}

// 动态元素插入水合标记
`<div${ssrHydrationKey()}></div>`
```

---

## 10. Fragment 编译路线

### 10.1 基本 Fragment

**输入**：

```jsx
<>
  <div>A</div>
  <div>B</div>
</>
```

**DOM 模式输出**：

```javascript
const _tmpl = /*#__PURE__*/_$template(`<div>A</div><div>B</div>`);

const App = () => {
  const _el = _tmpl.cloneNode(true);
  // Fragment 返回多个兄弟节点
  const _nodes = _el.childNodes;
  // 或者返回 DocumentFragment
  const _frag = document.createDocumentFragment();
  _frag.append(..._nodes);
  return _frag;
};
```

### 10.2 动态 Fragment

**输入**：

```jsx
<>
  <Static />
  {dynamicContent}
</>
```

**DOM 模式输出**：

```javascript
const App = () => {
  const _frag = document.createDocumentFragment();
  
  // 静态部分
  _frag.appendChild(_Static());
  
  // 动态部分
  _$insert(_frag, () => dynamicContent());
  
  return _frag;
};
```

### 10.3 Fragment 嵌套

**输入**：

```jsx
<>
  <A />
  <>
    <B />
    <C />
  </>
  <D />
</>
```

**DOM 模式输出**：

```javascript
const App = () => {
  const _frag = document.createDocumentFragment();
  
  _frag.appendChild(_A());
  _frag.appendChild(_B());
  _frag.appendChild(_C());
  _frag.appendChild(_D());
  
  return _frag;
};
```

---

## 11. 编译优化策略

### 11.1 模板复用

**相同结构只创建一次**：

```jsx
// 列表中相同结构共享模板
{items.map(item => <li>{item.name}</li>)}
```

编译器检测到相同的模板结构（`<li>`），只生成一个模板定义。

### 11.2 静态提升

**静态内容移到模板**：

```jsx
// 优化前
<div>{staticValue}{dynamicValue}</div>

// 优化后：staticValue 合并到模板
const _tmpl = /*#__PURE__*/_$template(`<div>staticValue<!----></div>`, 1);
insert(_el, () => dynamicValue());
```

### 11.3 文本节点合并

**相邻静态文本合并**：

```jsx
// 优化前
<div>{"a"} {"b"} {"c"}</div>

// 优化后：合并为单一动态表达式
insert(_el, () => `${a()} ${b()} ${c()}`);
```

### 11.4 批量动态属性

**多个动态属性在同 effect 中处理**：

```javascript
// 优化前：多个独立 effect
effect(() => setAttribute(el, "a", a()));
effect(() => setAttribute(el, "b", b()));

// 优化后：批量处理
effect(() => {
  const _p = {};
  if (_p._$a !== (_p._$a = a())) setAttribute(el, "a", _p._$a);
  if (_p._$b !== (_p._$b = b())) setAttribute(el, "b", _p._$b);
}, { _$a: undefined, _$b: undefined });
```

### 11.5 短路求值优化

**非动态属性不生成比较**：

```javascript
// 简单值直接设置
_el.className = "static-class";
```

---

## 附录 A：编译决策表

| 语法特征 | 编译策略 | 输出形式 |
|---------|---------|----------|
| 静态文本 | 模板字符串 | HTML |
| 动态文本 | `insert()` | 运行时计算 |
| 静态属性 | HTML 属性 | HTML |
| 动态属性 | 直接调用 | 模板克隆体内 |
| DOM 属性 | 直接赋值 | 模板克隆体内 |
| 事件 onClick | delegateEvents | 委托到 document |
| 事件 on:* | addEventListener | 直接绑定 |
| 条件 && | && 表达式 | 运行时计算 |
| 条件三元 | ?: 表达式 | 运行时计算 |
| 列表 map | 循环生成 | map + 模板 |
| 组件 | createComponent | 组件调用 |

---

## 附录 B：运行时函数映射

| JSX 语法 | DOM 运行时函数 | SSR 运行时函数 |
|---------|---------------|---------------|
| `<div>` | `_$template()` | `_$ssr()` |
| 子节点 | `_$insert()` | 字符串拼接 |
| 属性 | `_$setAttribute()` | 内联到字符串 |
| class | `_$className()` | 内联到字符串 |
| classList | `_$classList()` | `_$ssrClassList()` |
| style | `_$style()` | `_$ssrStyle()` |
| onClick | 事件委托 | 事件绑定 |
| ref | - | - |
| spread | `_$spreadProps()` | `_$mergeProps()` |

---

## 附录 C：关键配置选项

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `moduleName` | `"dom"` | 运行时模块名 |
| `generate` | `"dom"` | 编译目标模式 |
| `hydratable` | `false` | 是否支持水合 |
| `delegateEvents` | `true` | 是否启用事件委托 |
| `delegatedEvents` | `[]` | 额外的委托事件列表 |
| `wrapConditionals` | `true` | 是否包装条件表达式 |
| `staticMarker` | `"@once"` | 静态标记注释 |
| `builtIns` | `[]` | 内置组件列表 |
| `effectWrapper` | `"effect"` | 副作用包装函数名 |
| `memoWrapper` | `"memo"` | 记忆化包装函数名 |
