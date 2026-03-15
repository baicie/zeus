# Zeus 编译器 DOM 表达式方案设计

## 1. 设计目标与概述

### 1.1 核心要求

本方案旨在设计一个高性能的前端框架编译器，实现以下四个核心目标：

1. **响应式核心**：采用 alien-signal（精细化响应式信号系统）
2. **无虚拟 DOM**：采用直接 DOM 操作模式，类似 SolidJS 的编译器驱动渲染
3. **Rust + OXC 编译**：使用 Rust 语言和 oxc 框架实现编译器，确保编译效率和性能
4. **最小化运行时**：尽可能将计算转移到编译时，降低运行时体积

### 1.2 设计理念

本方案的设计灵感来源于 SolidJS 的 dom-expressions 编译器，但在技术选型和架构设计上做了以下创新：

- 使用 Rust 语言重写编译器，利用 oxc 提供的高效 AST 处理能力
- 结合 alien-signal 实现更轻量的响应式系统
- 优化代码生成策略，进一步压缩运行时体积

### 1.3 参考实现

本方案深入分析了 dom-expressions 的以下关键特性：

- **模板字面量**：使用 HTML 模板字符串作为静态内容的载体
- **Comment 占位符**：使用注释节点作为动态内容插入的位置标记
- **事件委托**：通过事件委托机制减少事件监听器数量
- **直接属性赋值**：优先使用直接属性赋值而非 setAttribute

---

## 2. 整体架构设计

### 2.1 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                     Source Code (JSX/TSX)                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│           Rust Compiler (OXC-based)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Parser    │→ │   AST       │→ │  Transform  │         │
│  │  (oxc)      │  │   Walk      │  │   Phase     │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│         │                              │                   │
│         ▼                              ▼                   │
│  ┌─────────────┐              ┌─────────────┐              │
│  │ TemplateIR  │←─────────────│  Code Gen   │              │
│  │   分析       │              │   生成       │              │
│  └─────────────┘              └─────────────┘              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                Generated JavaScript Code                    │
│  - import { template, insert, effect, ... } from "@zeus-js/core"
│  - const _tmpl$1 = template("<div>...</div>")
│  - (() => { const _el$ = _tmpl$1(); ... return _el$; })()
└─────────────────────────────────────────────────────────────┘
```

### 2.2 编译流水线

整个编译过程分为四个主要阶段：

**第一阶段：解析（Parser）**

使用 oxc 解析器将 JSX/TSX 源代码解析为 AST（抽象语法树）。这一阶段是纯静态的，不修改任何代码。

```rust
// 解析输入代码
let allocator = Allocator::default();
let source_type = SourceType::jsx();
let program = parser::parse_source(&allocator, source, source_type)?;
```

**第二阶段：AST 遍历与模式识别**

遍历 AST，识别以下关键模式：

- JSX 元素：`<div>...</div>`
- JSX 片段：`<>...</>`
- 条件表达式：三元运算符 `? :`、逻辑与 `&&`
- 列表渲染：`.map()` 调用
- 组件调用：`<Component />`
- 控制流模式：if-return 模式

**第三阶段：模板分析（Template Analysis）**

对于每个 JSX 元素，分析生成 TemplateIR（模板中间表示）。这个阶段的核心任务是将 JSX 元素分解为静态 HTML 和动态绑定两部分。

**第四阶段：代码生成（Code Generation）**

根据 TemplateIR 生成优化后的 JavaScript 代码，包括：

- 模板声明语句
- 元素创建和属性设置
- 事件绑定
- 动态内容插入

### 2.3 模块划分

```
crates/compiler-dom/src/
├── lib.rs                    # 主入口，暴露编译器 API
├── jsx.rs                    # JSX 元素编译核心逻辑
├── template_analyzer.rs       # 模板分析，生成 TemplateIR
├── template_ir.rs            # 模板中间表示数据结构
├── control_flow.rs           # 控制流分析（if-return 模式）
├── ast_transform.rs          # AST 级别转换
├── code_generator.rs         # 代码生成器
├── dom_handler.rs           # DOM 特定处理（事件、属性）
└── utils.rs                 # 工具函数（HTML 转义等）
```

---

## 3. 模板中间表示（TemplateIR）

### 3.1 数据结构设计

TemplateIR 是连接模板分析和代码生成的核心数据结构：

```rust
pub struct TemplateIR {
    /// 静态 HTML 模板字符串
    pub html: String,
    /// 模板变量名（如 "_tmpl$1"）
    pub template_var: String,
    /// 动态绑定列表
    pub bindings: Vec<Binding>,
    /// 委托事件名称列表
    pub delegated_events: Vec<String>,
}
```

### 3.2 绑定类型（BindingKind）

```rust
pub enum BindingKind {
    /// 动态内容插入
    Insert { expression_source: String },
    /// 委托事件（绑定到元素属性）
    DelegatedEvent { event_name: String, handler_source: String },
    /// 直接事件（使用 addEventListener）
    DirectEvent { event_name: String, handler_source: String },
    /// HTML 属性
    Attribute { name: String, value_source: String, is_dynamic: bool },
    /// 类名
    ClassName { value_source: String, is_dynamic: bool },
    /// 样式
    Style { value_source: String, is_dynamic: bool },
    /// DOM 引用
    Ref { ref_source: String, is_dom_ref: bool },
    /// 属性展开
    Spread { props_source: String },
}
```

### 3.3 DOM 路径（DomPath）

用于定位 DOM 树中的元素节点：

```rust
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct DomPath {
    /// 从根节点到目标节点的遍历步骤
    pub steps: Vec<TraversalStep>,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum TraversalStep {
    /// 获取第一个子节点
    FirstChild,
    /// 获取下一个兄弟节点
    NextSibling,
}
```

---

## 4. 编译策略详解

### 4.1 模板生成策略

#### 4.1.1 静态内容处理

所有静态内容直接写入模板字符串：

```jsx
<!-- 输入 -->
<div>Hello World</div>

<!-- 输出 -->
const _tmpl$1 = template("<div>Hello World</div>");
```

#### 4.1.2 动态内容处理

动态内容使用 comment 节点作为占位符：

```jsx
<!-- 输入 -->
<div>{message()}</div>

<!-- 输出 -->
const _tmpl$1 = template("<div><!----></div>");
```

编译时生成的代码会使用 `insert` 函数在 comment 节点位置插入动态内容。

#### 4.1.3 混合内容处理

当一个元素同时包含静态和动态内容时：

```jsx
<!-- 输入 -->
<div>Hello {name()}!</div>

<!-- 输出 -->
const _tmpl$1 = template("<div>Hello <!---->!</div>");
```

### 4.2 事件处理策略

#### 4.2.1 委托事件（Delegated Events）

对于常见的事件（如 click、input），使用事件委托机制：

```jsx
<!-- 输入 -->
<button onClick={handler}>Click</button>

<!-- 输出 -->
_el$.$$click = handler;
```

运行时通过全局事件委托处理这些事件：

```javascript
// 运行时委托处理
document.addEventListener('click', (e) => {
  const handler = e.target.$$click;
  if (handler) handler(e);
});
```

#### 4.2.2 直接事件（Direct Events）

对于不能委托的事件，使用 addEventListener：

```jsx
<!-- 输入 -->
<video onEnded={handler} />

<!-- 输出 -->
_el$.addEventListener("ended", handler);
```

### 4.3 属性处理策略

| 属性类型 | 编译输出 | 运行时函数 |
|---------|---------|-----------|
| class | `className(el, value)` | className |
| className | `className(el, value)` | className |
| style | `style(el, value)` | style |
| value | `el.value = value` | 直接赋值 |
| checked | `el.checked = value` | 直接赋值 |
| 其他属性 | `setAttribute(el, name, value)` | setAttribute |
| 动态属性 | `setProperty(el, name, value)` | setProperty |
| ref | `el = node` 或 `ref(el, refFn)` | ref |

### 4.4 条件渲染编译

#### 4.4.1 三元运算符

```jsx
<!-- 输入 -->
<div>{show() ? <span>Yes</span> : <span>No</span>}</div>

<!-- 输出 -->
insert(_el$, () => show() ? (() => {
  const _tmpl$2 = template("<span>Yes</span>");
  return _tmpl$2();
})() : (() => {
  const _tmpl$3 = template("<span>No</span>");
  return _tmpl$3();
})());
```

#### 4.4.2 逻辑与表达式

```jsx
<!-- 输入 -->
<div>{show() && <Content />}</div>

<!-- 输出 -->
insert(_el$, () => show() && (() => {
  const _tmpl$2 = template("<div>Content</div>");
  return _tmpl$2();
})());
```

#### 4.4.3 if-return 模式转换

编译器支持将 if-return 模式转换为三元表达式：

```jsx
// 输入
function Component() {
  if (error()) {
    return <Error />;
  }
  return <Content />;
}

// 输出
function Component() {
  return error() ? <Error /> : <Content />;
}
```

### 4.5 列表渲染编译

```jsx
<!-- 输入 -->
<ul>
  {items().map(item => <li key={item.id}>{item.name}</li>)}
</ul>

<!-- 输出 -->
const _tmpl$1 = template("<ul><li><!----></li></ul>");
const _el$ = _tmpl$1();
const _li$ = _el$.firstChild;

insert(_el$, () => items().map(item => {
  const _tmpl$2 = template(`<li>${item.name}</li>`);
  return _tmpl$2();
}), _li$);
```

---

## 5. 运行时设计

### 5.1 核心运行时 API

运行时提供最小化的核心函数：

```typescript
// @zeus-js/core

/**
 * 创建模板元素
 * @param html HTML 模板字符串
 * @param isSVG 是否为 SVG 元素
 * @returns 返回一个函数，调用后返回克隆的 DOM 节点
 */
export function template(html: string, isSVG?: boolean): () => Element;

/**
 * 动态内容插入
 * @param parent 父元素
 * @param accessor 值访问器（响应式函数）
 * @param marker 位置标记元素（可选）
 */
export function insert(
  parent: Element,
  accessor: () => any,
  marker?: Element
): void;

/**
 * 注册委托事件
 * @param events 事件名称数组
 */
export function delegateEvents(events: string[]): void;

/**
 * 创建响应式副作用
 * @param fn 副作用函数
 */
export function effect(fn: () => void): void;

/**
 * 设置类名
 */
export function className(el: Element, value: any): void;

/**
 * 设置样式
 */
export function style(el: Element, value: any): void;

/**
 * 设置 HTML 属性
 */
export function setAttribute(el: Element, name: string, value: any): void;

/**
 * 设置 DOM 属性
 */
export function setProperty(el: Element, name: string, value: any): void;

/**
 * 条件渲染 - 仅 if
 */
export function ifOnly(
  condition: () => boolean,
  render: () => any
): any;

/**
 * 条件渲染 - 完整条件
 */
export function conditional(options: {
  condition: () => boolean;
  then: () => any;
  else?: () => any;
}): any;
```

### 5.2 响应式系统集成

基于 alien-signal 的细粒度响应式：

```typescript
// @zeus-js/signal

/**
 * 创建信号
 * @param initialValue 初始值
 * @returns [getter, setter] 元组
 */
export function signal<T>(value: T): [() => T, (value: T) => void];

/**
 * 创建计算值
 * @param fn 计算函数
 * @returns 计算值的 getter
 */
export function memo<T>(fn: () => T): () => T;

/**
 * 创建副作用
 * @param fn 副作用函数
 */
export function effect(fn: () => void): void;

/**
 * 创建不可达跟踪
 * @param fn 跟踪函数
 */
export function untrack<T>(fn: () => T): T;
```

### 5.3 事件委托实现

运行时事件委托的核心实现：

```typescript
// 委托事件处理器
const DELEGATED_EVENTS = new Map<string, (e: Event) => void>();

export function delegateEvents(events: string[]) {
  for (const event of events) {
    if (!DELEGATED_EVENTS.has(event)) {
      const handler = (e: Event) => {
        const target = e.target as Element;
        // 向上遍历 DOM 树查找处理程序
        let current: Element | null = target;
        while (current) {
          const handler = (current as any)[`$$${event}`];
          if (handler) {
            handler(e);
            return;
          }
          current = current.parentElement;
        }
      };
      DELEGATED_EVENTS.set(event, handler);
      document.addEventListener(event, handler);
    }
  }
}
```

---

## 6. 编译优化策略

### 6.1 模板复用

相同结构的元素共享模板定义：

```javascript
// 相同结构的组件共享一个模板
const _tmpl$1 = template("<div>Hello</div>");

function Component1() { return _tmpl$1(); }
function Component2() { return _tmpl$1(); }
```

### 6.2 静态提升

编译时能够确定的值直接提升为常量：

```jsx
<!-- 输入 -->
<div class="static">Content</div>

<!-- 输出 - class 作为静态属性 -->
const _tmpl$1 = template('<div class="static">Content</div>');
```

### 6.3 内联优化

简单的动态表达式在编译时进行优化：

```jsx
<!-- 输入 -->
<div class={"item-" + id()}>

<!-- 输出 -->
className(_el$, "item-" + id());
```

### 6.4 变量共享

对于复杂的 DOM 遍历路径，编译器会分析并复用已有的变量：

```jsx
<!-- 输入 -->
<div>
  <span>{a()}</span>
  <span>{b()}</span>
  <span>{c()}</span>
</div>

<!-- 输出 -->
const _tmpl$1 = template("<div><span><!----></span><span><!----></span><span><!----></span></div>");
const _el$ = _tmpl$1();
const _el$1 = _el$.firstChild;
const _el$2 = _el$1.nextSibling;
const _el$3 = _el$2.nextSibling;
// 使用共享的遍历路径
```

---

## 7. 完整编译示例

### 7.1 基础组件示例

**输入代码**：

```tsx
function Counter() {
  const [count, setCount] = signal(0);
  
  return (
    <div>
      <h1 class="title">Counter: {count()}</h1>
      <button onClick={() => setCount(count() + 1)}>
        Increment
      </button>
    </div>
  );
}
```

**编译输出**：

```javascript
import { template, insert, className, effect, signal, delegateEvents } from "@zeus-js/core";

const _tmpl$1 = template("<div><h1 class=\"title\">Counter: <!----></h1><button>Increment</button></div>");

function Counter() {
  const [count, setCount] = signal(0);
  
  const _el$ = _tmpl$1();
  const _el$1 = _el$.firstChild;
  const _el$2 = _el$1.nextSibling;
  
  // 动态内容插入
  insert(_el$1, () => count());
  
  // 事件委托 - 编译为元素属性赋值
  _el$2.$$click = () => setCount(count() + 1);
  
  return _el$;
}

// 注册委托事件
delegateEvents(["click"]);
```

### 7.2 条件渲染示例

**输入代码**：

```tsx
function App() {
  const show = () => true;
  
  return (
    <div>
      {show() ? <span>Visible</span> : <span>Hidden</span>}
    </div>
  );
}
```

**编译输出**：

```javascript
import { template, insert } from "@zeus-js/core";

const _tmpl$1 = template("<div><!----></div>");

function App() {
  const show = () => true;
  
  const _el$ = _tmpl$1();
  
  insert(_el$, () => show() 
    ? (() => {
        const _tmpl$2 = template("<span>Visible</span>");
        return _tmpl$2();
      })()
    : (() => {
        const _tmpl$3 = template("<span>Hidden</span>");
        return _tmpl$3();
      })()
  );
  
  return _el$;
}
```

### 7.3 列表渲染示例

**输入代码**：

```tsx
function List({ items }) {
  return (
    <ul>
      {items().map(item => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}
```

**编译输出**：

```javascript
import { template, insert } from "@zeus-js/core";

const _tmpl$1 = template("<ul><li><!----></li></ul>");

function List({ items }) {
  const _el$ = _tmpl$1();
  const _li$ = _el$.firstChild;
  
  insert(_el$, () => items().map(item => {
    const _tmpl$2 = template(`<li>${item.name}</li>`);
    return _tmpl$2();
  }), _li$);
  
  return _el$;
}
```

---

## 8. 实现路线图

### 8.1 阶段 1：基础框架（预计 2 周）

**目标**：搭建编译器基础框架，实现基本的 JSX 编译功能

**任务清单**：

- [ ] 完善 Rust 编译器基础结构
- [ ] 实现 JSX 元素解析（处理基本标签）
- [ ] 实现模板生成（template 函数调用）
- [ ] 实现基本的 DOM 属性设置（class、style）
- [ ] 添加基础测试用例

**里程碑**：能够编译基本的静态 JSX 元素

### 8.2 阶段 2：动态特性（预计 2 周）

**目标**：实现动态内容、事件处理和条件渲染

**任务清单**：

- [ ] 实现动态内容插入（insert 函数）
- [ ] 实现事件处理（委托事件 + 直接事件）
- [ ] 实现条件渲染编译（三元运算符、逻辑与）
- [ ] 实现列表渲染编译（map 调用）
- [ ] 实现组件调用编译

**里程碑**：能够编译包含动态内容的完整组件

### 8.3 阶段 3：优化与完善（预计 1 周）

**目标**：优化编译结果，完善错误处理

**任务清单**：

- [ ] 模板复用优化
- [ ] 控制流模式优化（if-return → ternary）
- [ ] 完善错误处理和警告信息
- [ ] 添加完整的测试用例
- [ ] 性能测试和优化

**里程碑**：编译器达到生产就绪状态

---

## 9. 技术对比

### 9.1 与 React 的对比

| 特性 | React | Zeus（本方案） |
|-----|-------|--------------|
| 渲染机制 | 虚拟 DOM | 直接 DOM 操作 |
| 响应式 | 组件级重新渲染 | 细粒度信号 |
| 编译方式 | 运行时 + 构建时 | 纯编译时 |
| 运行时大小 | ~40KB (React) | 目标 <8KB |
| 模板 | JSX（运行时解析） | 模板字面量（编译时） |

### 9.2 与 SolidJS 的对比

| 特性 | SolidJS (dom-expressions) | Zeus（本方案） |
|-----|--------------------------|--------------|
| 编译器语言 | JavaScript (Babel) | Rust (oxc) |
| 响应式系统 | Solid Signals | alien-signal |
| 编译优化 | 标准优化 | 额外的压缩优化 |
| 事件委托 | 相同机制 | 相同机制 |

### 9.3 预期收益

相比现有方案，预期实现以下收益：

1. **更小的运行时**：通过 alien-signal 和精细的代码生成
2. **更快的编译速度**：通过 Rust + oxc 的高效实现
3. **更好的类型安全**：通过 Rust 的类型系统
4. **更友好的错误信息**：通过编译时的详细诊断

---

## 10. 附录

### 10.1 编译配置选项

```rust
pub struct DomCompilerOptions {
    /// 是否启用 JSX 编译
    pub jsx: bool,
    /// JSX pragma（默认 "h"）
    pub jsx_pragma: Option<String>,
    /// JSX Fragment pragma（默认 "Fragment"）
    pub jsx_pragma_frag: Option<String>,
    /// 是否启用 DOM 优化
    pub dom_optimizations: bool,
    /// 运行时模块路径（默认 "@zeus-js/core"）
    pub runtime_module: Option<String>,
    /// 是否启用 Hydration 支持
    pub hydratable: bool,
    /// 是否启用事件委托（默认 true）
    pub delegate_events: bool,
}
```

### 10.2 编译错误类型

```rust
pub struct CompileError {
    /// 错误消息
    pub message: String,
    /// 错误起始位置
    pub start_offset: u32,
    /// 错误结束位置
    pub end_offset: u32,
}
```

### 10.3 相关资源

- [oxc 文档](https://oxc-project.github.io/)
- [dom-expressions 源码](https://github.com/ryansolid/dom-expressions)
- [SolidJS 源码](https://github.com/solidjs/solid)
- [alien-signal 文档](https://github.com/ryansolid/dom-expressions)

---

*本文档最后更新于 2026 年 3 月*
