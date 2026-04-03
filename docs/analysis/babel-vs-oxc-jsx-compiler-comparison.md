# Babel vs OXC JSX 编译器使用差异对比

> 基于 `babel-plugin-jsx-dom-expressions` 与 Zeus (oxc-based) 编译器的详细对比分析

---

## 目录

- [1. 概述](#1-概述)
- [2. 基础架构对比](#2-基础架构对比)
- [3. AST 处理对比](#3-ast-处理对比)
- [4. JSX 转换实现对比](#4-jsx-转换实现对比)
- [5. 代码生成对比](#5-代码生成对比)
- [6. 性能对比](#6-性能对比)
- [7. API 设计对比](#7-api-设计对比)
- [8. 扩展性对比](#8-扩展性对比)
- [9. 实战代码对照](#9-实战代码对照)
- [10. 迁移指南](#10-迁移指南)

---

## 1. 概述

### 1.1 工具定位

| 方面 | Babel | OXC |
|------|-------|-----|
| **定位** | 通用的 JavaScript/JSX 编译器框架 | 高性能 JavaScript 工具链 (parser+linter+minifier+compiler) |
| **语言** | JavaScript/TypeScript | Rust |
| **核心优势** | 插件生态丰富、易于扩展 | 极致性能、CSS/HTML/JS 一体化 |
| **适用场景** | Webpack 集成、复杂 AST 转换 | 大型项目、CI/CD 流水线 |

### 1.2 关键差异概览

| 功能 | Babel | OXC | 差异说明 |
|------|-------|-----|----------|
| **AST 类型** | `@babel/types` | `oxc_ast::ast::*` | 类型系统完全不同 |
| **Visitor 模式** | Babel Traverse | `traverse_mut` | 遍历方式不同 |
| **作用域分析** | `@babel/traverse` 内置 | 独立的 `oxc_semantic` | OXC 需要显式构建 |
| **代码生成** | `@babel/generator` | `oxc_codegen` | 输出格式略有差异 |
| **并行处理** | 需手动处理 | 原生支持 | OXC 可多线程解析 |
| **插件开发** | JS/TS | Rust | 语言差异 |

---

## 2. 基础架构对比

### 2.1 Babel 插件架构

```
┌─────────────────────────────────────────────────────────────┐
│                      Babel 插件架构                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Babel Core                                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Parser → Traverser → Generator                      │   │
│  └─────────────────────────────────────────────────────┘   │
│           │              │              │                    │
│           ▼              ▼              ▼                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐         │
│  │ @babel/      │ │ @babel/      │ │ @babel/      │         │
│  │ parser       │ │ traverse     │ │ generator    │         │
│  │ (JS/TS解析)  │ │ (AST遍历)    │ │ (代码生成)    │         │
│  └─────────────┘ └─────────────┘ └─────────────┘         │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           Plugin Pipeline                             │   │
│  │  Plugin1 → Plugin2 → Plugin3 → ...                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 OXC 工具链架构

```
┌─────────────────────────────────────────────────────────────┐
│                      OXC 工具链架构                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  oxc_parser          oxc_semantic      oxc_codegen         │
│  ┌─────────┐        ┌───────────┐     ┌────────────┐      │
│  │  Parser │───────▶│ Semantic  │────▶│  Codegen    │      │
│  │         │        │ Builder   │     │             │      │
│  └─────────┘        └───────────┘     └────────────┘      │
│       │                   │                   │              │
│       ▼                   ▼                   ▼              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              oxc_traverse (0.123.0+)                 │   │
│  │              traverse_mut + Scoping                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ oxc_    │ │ oxc_    │ │ oxc_    │ │ oxc_    │           │
│  │ linter  │ │ minifier│ │ printer │ │ binding │           │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 编译器入口对比

#### Babel 插件入口

```javascript
// babel-plugin-jsx-dom-expressions/src/index.ts
import SyntaxJSX from "@babel/plugin-syntax-jsx";
import { transformJSX } from "./shared/transform";
import postprocess from "./shared/postprocess";
import preprocess from "./shared/preprocess";

export default () => ({
  name: "JSX DOM Expressions",
  inherits: SyntaxJSX.default,  // 继承 JSX 语法支持
  
  visitor: {
    // JSX 元素和片段由 transformJSX 处理
    JSXElement: transformJSX,
    JSXFragment: transformJSX,
    
    Program: {
      // 进入时预处理：合并配置
      enter: preprocess,
      // 退出时后处理：追加模板
      exit: postprocess
    }
  }
});
```

#### OXC Rust 插件入口 (Zeus)

```rust
// crates/compiler-core/src/jsx/mod.rs

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_traverse::{traverse_mut, Traverse, TraverseCtx};

/// JSX 编译器主入口
pub fn compile(source: &str, config: JsxConfig) -> CompileResult {
    // 1. 创建分配器
    let allocator = Allocator::default();
    
    // 2. 解析源代码
    let ret = Parser::new(&allocator, source, SourceType::jsx()).parse();
    let mut program = ret.program;
    
    // 3. 构建语义分析（关键步骤）
    let semantic = SemanticBuilder::new()
        .with_cfg(true)
        .build(&program);
    let scoping = semantic.scoping;
    
    // 4. 创建编译器状态
    let mut state = JsxCompilerState::new(config);
    
    // 5. 执行 AST 遍历转换 (0.123.0 签名)
    traverse_mut::<JsxCompilerPass>(
        &allocator,
        &mut program,
        scoping,
        JsxCompilerState::new(config),
    );
    
    // 6. 后处理
    postprocess(&mut program, &state, &allocator);
    
    // 7. 代码生成
    generate_code(&program, &state)
}
```

---

## 3. AST 处理对比

### 3.1 AST 节点类型

#### Babel AST 节点 (JS)

```javascript
// @babel/types 定义的 JSX 节点结构
{
  type: "JSXElement",
  openingElement: {
    type: "JSXOpeningElement",
    name: {
      type: "JSXIdentifier",
      name: "div"
    },
    attributes: [
      {
        type: "JSXAttribute",
        name: { type: "JSXIdentifier", name: "className" },
        value: {
          type: "JSXExpressionContainer",
          expression: { type: "Identifier", name: "className" }
        }
      }
    ],
    selfClosing: false
  },
  closingElement: {
    type: "JSXClosingElement",
    name: { type: "JSXIdentifier", name: "div" }
  },
  children: []
}
```

#### OXC AST 节点 (Rust)

```rust
// oxc_ast::ast::JsxElement
pub struct JsxElement<'a> {
    pub span: Span,
    pub opening_element: JsxOpeningElement<'a>,
    pub closing_element: Option<JsxClosingElement<'a>>,
    pub children: Vec<JsxChild<'a>>,
}

// JsxOpeningElement
pub struct JsxOpeningElement<'a> {
    pub span: Span,
    pub name: JsxElementName<'a>,
    pub attributes: Vec<JsxAttribute<'a>>,
    pub self_closing: bool,
}

// JsxAttribute
pub enum JsxAttribute<'a> {
    JsxAttribute(JsxAttr<'a>),
    JsxSpreadAttribute(JsxSpreadAttr<'a>),
}

// JsxAttr
pub struct JsxAttr<'a> {
    pub span: Span,
    pub name: JsxAttrName<'a>,
    pub value: Option<JsxAttrValue<'a>>,
}
```

### 3.2 Visitor 模式对比

#### Babel Visitor

```javascript
// 遍历 JSXElement
export function transformJSX(path, state) {
  const node = path.node;
  
  // 访问子节点
  path.traverse({
    JSXAttribute(childPath) {
      const attr = childPath.node;
      // 处理属性...
    },
    JSXExpressionContainer(childPath) {
      const expr = childPath.node.expression;
      // 处理表达式...
    }
  });
  
  // 替换当前节点
  path.replaceWith(/* 新节点 */);
}

// 替换后替换表达式
path.replaceWith(
  t.callExpression(
    t.identifier("template"),
    [t.stringLiteral(html)]
  )
);
```

#### OXC traverse_mut (0.123.0+)

```rust
// 0.122 之前的老签名
pub fn traverse_mut<'a, 'h>(pass: &mut impl ast::VisitMut<'a>, allocator: &'a Allocator, program: &mut Program<'a>)

// 0.123.0+ 的新签名 (需要 Scoping)
pub fn traverse_mut<'a, 'ast, 's, P>(allocator: &'a Allocator, program: &'s mut Program<'a>, scoping: Scoping<'s, 'ast>, state: P)
where
    P: Traverse<'ast> + 's
```

```rust
// crates/compiler-core/src/jsx/transform.rs

use oxc_ast::ast::*;
use oxc_traverse::TraverseCtx;

pub struct JsxCompilerPass<'a, 'ast> {
    pub source: &'a str,
    pub state: &'a mut JsxCompilerState<'a>,
}

impl<'a> oxc_traverse::Traverse<'ast> for JsxCompilerPass<'a, 'ast> {
    // 自定义需要访问的节点类型
}

impl<'a, 'ast> VisitMut<'ast> for JsxCompilerPass<'a, 'ast> {
    // 访问 JSXElement
    fn visit_jsx_element(&mut self, expr: &mut JsxElement<'ast>, ctx: &mut TraverseCtx<'ast>) {
        // 转换逻辑
        self.transform_jsx_element(expr, ctx);
    }
    
    // 访问 JSXFragment
    fn visit_jsx_fragment(&mut self, frag: &mut JsxFragment<'ast>, ctx: &mut TraverseCtx<'ast>) {
        self.transform_jsx_fragment(frag, ctx);
    }
    
    // 访问 JSXAttribute
    fn visit_jsx_attribute(&mut self, attr: &mut JsxAttribute<'ast>, ctx: &mut TraverseCtx<'ast>) {
        self.transform_jsx_attribute(attr, ctx);
    }
}
```

### 3.3 作用域分析对比

#### Babel 作用域

```javascript
// Babel 自动维护作用域
export function transformJSX(path, state) {
  // 绑定检查自动处理
  const binding = path.scope.getBinding("someVar");
  if (binding !== undefined) {
    // 变量存在
  }
  
  // 快速成员检查
  if (t.isMemberExpression(node)) {
    // ...
  }
}
```

#### OXC 作用域 (oxc_semantic)

```rust
// 需要显式构建 semantic
use oxc_semantic::SemanticBuilder;

let semantic = SemanticBuilder::new()
    .with_cfg(true)
    .build(&program);

let scoping = semantic.scoping;

// 在 traverse 中使用 scoping
impl<'a, 'ast> JsxCompilerPass<'a, 'ast> {
    fn check_binding(&self, name: &str, ctx: &TraverseCtx<'ast>) -> Option<BindingId> {
        ctx.scoping().get_binding(ctx.current_scope_id(), name)
    }
}
```

---

## 4. JSX 转换实现对比

### 4.1 元素转换对比

#### Babel 实现

```javascript
// dom/element.js
export function transformElement(path, info) {
  const config = getConfig(path);
  let tagName = getTagName(path.node);
  
  // 创建结果对象
  const results = {
    template: `<${tagName}`,
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: false,
    hasCustomElement: false,
    tagName,
    renderer: "dom"
  };
  
  // 生成元素 ID
  if (!info.skipId) {
    results.id = path.scope.generateUidIdentifier("el$");
  }
  
  // 处理属性
  transformAttributes(path, results);
  
  // 闭合标签
  results.template += ">";
  
  // 处理子节点
  if (!isVoidElement(tagName)) {
    transformChildren(path, results, config);
    results.template += `</${tagName}>`;
  }
  
  return results;
}

// 获取标签名
function getTagName(node) {
  const name = node.openingElement.name;
  if (t.isJSXIdentifier(name)) {
    return name.name;
  }
  // 处理 NamespacedName 等
  // ...
}
```

#### OXC 实现 (Rust)

```rust
// crates/compiler-dom/src/jsx/element.rs

use oxc_ast::ast::*;
use oxc_span::Atom;
use oxc_allocator::Atom;

pub struct ElementTransform<'a> {
    pub template: String,
    pub declarations: Vec<Statement<'a>>,
    pub expressions: Vec<Expression<'a>>,
    pub dynamics: Vec<DynamicPart<'a>>,
    pub is_svg: bool,
    pub tag_name: Atom<'a>,
}

impl<'a, 'ast> JsxCompilerPass<'a, 'ast> {
    pub fn transform_element(
        &mut self,
        elem: &mut JsxElement<'ast>,
        ctx: &mut TraverseCtx<'ast>,
    ) -> ElementTransform<'a> {
        let config = &self.state.config;
        
        // 获取标签名
        let tag_name = self.get_tag_name(&elem.opening_element.name, ctx);
        
        // 检查 SVG 元素
        let is_svg = is_svg_element(&tag_name);
        
        let mut result = ElementTransform {
            template: format!("<{}", tag_name),
            declarations: Vec::new(),
            expressions: Vec::new(),
            dynamics: Vec::new(),
            is_svg,
            tag_name: tag_name.clone(),
        };
        
        // 处理属性
        self.transform_attributes(&elem.opening_element.attributes, &mut result, ctx);
        
        // 闭合标签
        result.template.push('>');
        
        // 处理子节点
        if !is_void_element(&tag_name) {
            self.transform_children(&elem.children, &mut result, ctx);
            result.template.push_str(&format!("</{}>", tag_name));
        }
        
        result
    }
    
    fn get_tag_name(&self, name: &JsxElementName<'ast>, ctx: &TraverseCtx<'ast>) -> Atom<'a> {
        match name {
            JsxElementName::Identifier(ident) => ident.name.clone(),
            // 处理其他情况...
        }
    }
}
```

### 4.2 属性转换对比

#### Babel 实现

```javascript
// dom/element.js - 属性处理
function transformAttributes(path, results) {
  const attributes = path.get("openingElement").get("attributes");
  
  for (const attrPath of attributes) {
    const node = attrPath.node;
    
    if (t.isJSXSpreadAttribute(node)) {
      // Spread 属性处理
      processSpread(attrPath, results);
      continue;
    }
    
    const name = get_attr_name(node.name);
    const value = node.value;
    
    if (value === null) {
      // 布尔属性
      results.template.push(` ${name}`);
      continue;
    }
    
    if (t.isJSXExpressionContainer(value)) {
      const expr = value.expression;
      
      if (isDynamic(expr, { checkMember: true })) {
        // 动态属性
        results.dynamics.push({
          elem: results.id,
          name,
          expr
        });
      } else {
        // 静态属性
        results.template.push(` ${name}="${evaluate(expr)}"`);
      }
    }
  }
}
```

#### OXC 实现 (Rust)

```rust
// crates/compiler-dom/src/jsx/attributes.rs

use oxc_ast::ast::*;
use oxc_span::Atom;

impl<'a, 'ast> JsxCompilerPass<'a, 'ast> {
    pub fn transform_attributes(
        &mut self,
        attrs: &[JsxAttribute<'ast>],
        result: &mut ElementTransform<'a>,
        ctx: &mut TraverseCtx<'ast>,
    ) {
        for attr in attrs {
            match attr {
                JsxAttribute::JsxSpreadAttr(spread) => {
                    self.process_spread_attribute(spread, result, ctx);
                }
                JsxAttribute::JsxAttr(attr) => {
                    self.process_attribute(attr, result, ctx);
                }
            }
        }
    }
    
    fn process_attribute(
        &mut self,
        attr: &JsxAttr<'ast>,
        result: &mut ElementTransform<'a>,
        ctx: &mut TraverseCtx<'ast>,
    ) {
        let name = self.get_attribute_name(&attr.name);
        
        match &attr.value {
            None => {
                // 布尔属性
                result.template.push_str(&format!(" {}", name));
            }
            Some(value) => {
                match value {
                    JsxAttrValue::ExpressionContainer(expr) => {
                        let is_dynamic = self.is_dynamic(&expr.expression, ctx);
                        
                        if is_dynamic {
                            result.dynamics.push(DynamicPart {
                                elem: result.id.clone(),
                                name: name.clone(),
                                expression: expr.expression.clone(),
                            });
                        } else {
                            // 静态属性值
                            if let Some(lit) = self.evaluate_expression(&expr.expression) {
                                result.template.push_str(&format!(
                                    " {}=\"{}\"",
                                    name,
                                    self.escape_html(&lit)
                                ));
                            }
                        }
                    }
                    JsxAttrValue::StringLiteral(lit) => {
                        result.template.push_str(&format!(
                            " {}=\"{}\"",
                            name,
                            self.escape_html(&lit.value)
                        ));
                    }
                    _ => {}
                }
            }
        }
    }
}
```

### 4.3 事件处理对比

#### Babel 实现

```javascript
// dom/element.js - 事件处理
function processEvent(key, value, elem, results) {
  const config = getConfig(path);
  
  // 提取事件名 onClick -> click
  const eventName = key.slice(2).toLowerCase();
  
  if (key.startsWith("on:")) {
    // 非委托模式
    results.exprs.push(
      t.expressionStatement(
        t.callExpression(
          t.identifier("addEventListener"),
          [elem, t.stringLiteral(eventName), value.expression]
        )
      )
    );
  } else if (config.delegateEvents && DelegatedEvents.has(eventName)) {
    // 委托模式
    results.exprs.unshift(
      t.expressionStatement(
        t.assignmentExpression(
          "=",
          t.memberExpression(elem, t.identifier(`$$${eventName}`)),
          value.expression
        )
      )
    );
    // 注册事件
    events.add(eventName);
  } else {
    // 直接绑定
    results.exprs.unshift(
      t.expressionStatement(
        t.callExpression(
          t.identifier("addEventListener"),
          [elem, t.stringLiteral(eventName), value.expression]
        )
      )
    );
  }
}
```

#### OXC 实现 (Rust)

```rust
// crates/compiler-dom/src/jsx/events.rs

use oxc_ast::ast::*;
use oxc_span::Atom;
use std::collections::HashSet;

const DELEGATED_EVENTS: [&str; 22] = [
    "beforeinput", "click", "dblclick", "contextmenu",
    "focusin", "focusout", "input", "keydown", "keyup",
    "mousedown", "mousemove", "mouseout", "mouseover", "mouseup",
    "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup",
    "touchend", "touchmove", "touchstart"
];

impl<'a, 'ast> JsxCompilerPass<'a, 'ast> {
    pub fn process_event(
        &mut self,
        name: &str,           // 属性名如 "onClick"
        handler: &Expression<'ast>,
        elem_id: &Identifier<'a>,
        result: &mut ElementTransform<'a>,
        ctx: &mut TraverseCtx<'ast>,
    ) {
        // 提取事件名: onClick -> click
        let event_name = name.trim_start_matches("on");
        let event_name = event_name.to_lowercase();
        
        if name.starts_with("on:") {
            // 非委托模式: on:click
            let add_listener = ctx.ast.expression_statement(ctx.ast.ast.call_expression(
                ctx.ast.ast.identifier_reference("addEventListener"),
                ctx.ast.ast.vec([
                    elem_id.clone().into(),
                    ctx.ast.ast.string_literal(event_name).into(),
                    handler.clone().into(),
                ])
            ));
            result.expressions.push(add_listener.into());
        } else if self.config.delegate_events && DELEGATED_EVENTS.contains(&event_name.as_str()) {
            // 委托模式
            let handler_ident = ctx.ast.ast.identifier_reference(format!("${}${}", elem_id.name, event_name));
            
            // 赋值语句: el.$click = handler
            let assignment = ctx.ast.ast.statement_expression(
                ctx.ast.ast.expression_assignment(
                    oxc_ast::ast::AssignmentOperator::Assign,
                    handler_ident.into(),
                    handler.clone().into(),
                )
            );
            
            result.expressions.insert(0, assignment.into());
            
            // 注册事件
            self.state.delegated_events.insert(event_name);
        } else {
            // 直接绑定
            let add_listener = ctx.ast.expression_statement(ctx.ast.ast.call_expression(
                ctx.ast.ast.identifier_reference("addEventListener"),
                ctx.ast.ast.vec([
                    elem_id.clone().into(),
                    ctx.ast.ast.string_literal(event_name).into(),
                    handler.clone().into(),
                ])
            ));
            result.expressions.insert(0, add_listener.into());
        }
    }
}
```

---

## 5. 代码生成对比

### 5.1 Babel 代码生成

```javascript
// Babel Generator 配置
const code = generate(ast, {
  jsescapeOption: {
    minimal: true
  },
  comments: false,
  compact: false,
  sourceMaps: false,
  retainLines: false,
}, source);
```

### 5.2 OXC 代码生成

```rust
// oxc_codegen 使用
use oxc_codegen::{Codegen, CodegenOptions};

let source_text = Codegen::<&str>::new()
    .with_options(CodegenOptions {
        single_quote: false,
        ..CodegenOptions::default()
    })
    .build(&program)
    .source_text;
```

---

## 6. 性能对比

### 6.1 解析性能

| 指标 | Babel | OXC | 提升 |
|------|-------|-----|------|
| **解析速度** | ~1x | 3-5x | OXC 快 3-5 倍 |
| **内存占用** | 较高 | 较低 | OXC 更节省 |
| **并行解析** | 不支持 | 原生支持 | OXC 可多线程 |

### 6.2 转换性能

| 指标 | Babel | OXC | 说明 |
|------|-------|-----|------|
| **单线程** | 基准 | ~2x | OXC 在单线程时也更快 |
| **多线程** | 需手动 | 原生 | OXC traverse 支持并行 |
| **增量编译** | 支持 | 部分支持 | Babel cache 更好 |

### 6.3 性能优化策略

#### Babel 优化
- 缓存 AST
- 选择性插件加载
- 懒加载

#### OXC 优化
- 预分配内存 (Allocator)
- 零拷贝 AST
- SIMD 优化解析

---

## 7. API 设计对比

### 7.1 Babel 插件 API

```javascript
// 插件定义
export default function (api, options) {
  return {
    name: "my-plugin",
    inherits: SyntaxJSX.default,
    
    visitor: {
      Program: {
        enter(path, state) {
          // 预处理
        },
        exit(path, state) {
          // 后处理
        }
      },
      
      JSXElement(path, state) {
        // 转换 JSX 元素
      },
      
      // 更多 visitor 方法...
    },
    
    // 可选：宏定义
    macros(path) {
      // 宏展开
    }
  };
}
```

### 7.2 OXC 插件 API (Rust)

```rust
// 编译器定义
pub struct MyJsxCompiler<'a, 'ast> {
    pub config: JsxConfig,
    pub state: CompilerState<'a>,
}

impl<'a, 'ast> Traverse<'ast> for MyJsxCompiler<'a, 'ast> {
    // 定义需要遍历的节点
}

impl<'a, 'ast> VisitMut<'ast> for MyJsxCompiler<'a, 'ast> {
    // 实现访问方法
}

// 主入口
pub fn compile(source: &str, config: JsxConfig) -> Result<String, Error> {
    // 实现编译逻辑
}
```

### 7.3 NAPI-RS 绑定

```rust
// zeusjs_binding/src/lib.rs

use napi::bindgen_prelude::*;
use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;

#[napi]
pub fn transform_jsx(source: String, config: JsxTransformConfig) -> napi::Result<JsxTransformResult> {
    let allocator = Allocator::default();
    
    let ret = Parser::new(&allocator, &source, SourceType::jsx()).parse();
    if !ret.errors.is_empty() {
        return Err(Error::new(
            Status::GenericError,
            format!("Parse error: {:?}", ret.errors)
        ));
    }
    
    let mut program = ret.program;
    
    // 编译转换
    // ...
    
    // 代码生成
    let output = oxc_codegen::Codegen::<&str>::new()
        .build(&program)
        .source_text;
    
    Ok(JsxTransformResult {
        code: output,
        map: None,
    })
}
```

---

## 8. 扩展性对比

### 8.1 Babel 扩展点

| 扩展点 | 说明 | 示例 |
|--------|------|------|
| `visitor` | 访问 AST 节点 | `JSXElement(path) {}` |
| `inherits` | 继承其他插件 | `inherits: SyntaxJSX.default` |
| `manipulateOptions` | 修改解析选项 | 添加语法扩展 |
| `macros` | 宏定义 | 自定义语法转换 |

### 8.2 OXC 扩展点

| 扩展点 | 说明 | 示例 |
|--------|------|------|
| `VisitMut` | 修改 AST 节点 | `visit_jsx_element()` |
| `Visit` | 只读访问 | `enter_jsx_element()` |
| `Codegen` | 自定义生成器 | `GenExpr` trait |
| `Semantic` | 自定义分析 | 作用域/引用检查 |

### 8.3 自定义渲染器

#### Babel - Universal 模式

```javascript
// universal/element.js
export function transformElement(path, results) {
  const tagName = results.tagName;
  
  // 通用 API
  results.exprs.push(
    t.expressionStatement(
      t.callExpression(
        registerImportMethod(path, "createElement"),
        [t.stringLiteral(tagName)]
      )
    )
  );
  
  // 属性设置
  results.dynamics.forEach(d => {
    results.exprs.push(
      t.expressionStatement(
        t.callExpression(
          registerImportMethod(path, "setProp"),
          [results.id, t.stringLiteral(d.name), d.expr]
        )
      )
    );
  });
}
```

#### OXC - Universal 模式 (Rust)

```rust
// crates/compiler-universal/src/element.rs

impl<'a, 'ast> JsxCompilerPass<'a, 'ast> {
    pub fn transform_element_universal(
        &mut self,
        elem: &mut JsxElement<'ast>,
        ctx: &mut TraverseCtx<'ast>,
    ) -> ElementTransform<'a> {
        let mut result = ElementTransform::default();
        let tag_name = self.get_tag_name(&elem.opening_element.name, ctx);
        
        // createElement 调用
        let create_call = ctx.ast.expression_statement(ctx.ast.ast.call_expression(
            ctx.ast.ast.identifier_reference("createElement"),
            ctx.ast.ast.vec([tag_name.as_str().into()])
        ));
        
        result.expressions.push(create_call.into());
        
        // setProp 调用
        for dynamic in &result.dynamics {
            let set_prop = ctx.ast.expression_statement(ctx.ast.ast.call_expression(
                ctx.ast.ast.identifier_reference("setProp"),
                ctx.ast.ast.vec([
                    result.id.clone().into(),
                    dynamic.name.as_str().into(),
                    dynamic.expression.clone().into(),
                ])
            ));
            result.expressions.push(set_prop.into());
        }
        
        result
    }
}
```

---

## 9. 实战代码对照

### 9.1 JSX 输入示例

```jsx
// Input.jsx
import { createSignal } from "zeus";

function App() {
  const [count, setCount] = createSignal(0);
  
  return (
    <div class="container">
      <h1>Count: {count()}</h1>
      <button onClick={() => setCount(c => c + 1)}>
        Increment
      </button>
      <ul>
        {[1, 2, 3].map(n => (
          <li key={n}>{n}</li>
        ))}
      </ul>
    </div>
  );
}
```

### 9.2 Babel 输出 (dom-expressions)

```javascript
import { template as _template, insert as _insert, delegateEvents as _delegateEvents } from "zeus/runtime-dom";
import { createSignal } from "zeus";

_delegateEvents(["click"]);

const _tmpl = _template(`<div class="container"><h1>Count: <!----></h1><button>Increment</button><ul></ul></div>`);

function App() {
  const _el = _tmpl.cloneNode(true);
  const _h1 = _el.firstChild;
  const _btn = _h1.nextSibling;
  const _ul = _btn.nextSibling;
  
  const [count, setCount] = createSignal(0);
  
  _insert(_h1, count);
  
  _btn.$click = () => setCount(c => c + 1);
  
  _insert(_ul, () => [1, 2, 3].map(n => {
    const _tmpl$ = _template(`<li><!----></li>`);
    const _li = _tmpl$.cloneNode(true);
    _insert(_li, () => n);
    return _li;
  }));
  
  return _el;
}
```

### 9.3 OXC/Zeus 输出 (等价)

```rust
// Rust 编译器输出等价代码
use zeus::{template, insert, delegateEvents, createSignal};

delegateEvents(["click"]);

const TMPL: &'static str = "<div class=\"container\"><h1>Count: <!----></h1><button>Increment</button><ul></ul></div>";

#[zeus_component]
fn App() -> HtmlElement {
    let (count, setCount) = createSignal(0);
    let el = template(TMPL).cloneNode(true);
    let h1 = el.firstChild();
    let btn = h1.nextSibling();
    let ul = btn.nextSibling();
    
    insert(h1, || count());
    
    btn.set_click(|| setCount(|c| c + 1));
    
    insert(ul, || [1, 2, 3].map(|n| {
        let li = template("<li><!----></li>").cloneNode(true);
        insert(li, || n);
        li
    }));
    
    el
}
```

---

## 10. 迁移指南

### 10.1 Babel → OXC 迁移检查表

| 步骤 | 内容 | 状态 |
|------|------|------|
| 1 | 创建 Rust crate `compiler-core` | ✅ |
| 2 | 实现 AST 节点定义 | ✅ |
| 3 | 实现 `isDynamic` 动态性检测 | ✅ |
| 4 | 实现 JSXElement 转换 | ✅ |
| 5 | 实现 JSXFragment 转换 | ✅ |
| 6 | 实现属性转换 | ✅ |
| 7 | 实现事件委托系统 | ✅ |
| 8 | 实现模板生成 | ✅ |
| 9 | 实现代码生成器 | ✅ |
| 10 | 实现 NAPI-RS 绑定 | ✅ |
| 11 | 添加测试用例 | ⬜ |
| 12 | 性能优化 | ⬜ |

### 10.2 核心概念映射

| Babel 概念 | OXC 对应 | 说明 |
|-----------|---------|------|
| `t.identifier()` | `ast.identifier_reference()` | 创建标识符 |
| `t.stringLiteral()` | `ast.string_literal()` | 创建字符串 |
| `t.callExpression()` | `ast.call_expression()` | 创建调用 |
| `t.memberExpression()` | `ast.member_expression()` | 创建成员访问 |
| `t.arrowFunctionExpression()` | `ast.arrow_function_expression()` | 创建箭头函数 |
| `path.replaceWith()` | 直接修改 `&mut node` | 替换节点 |
| `path.skip()` | 不调用 `ctx.visit()` | 跳过遍历 |
| `path.scope.getBinding()` | `scoping.get_binding()` | 获取绑定 |

### 10.3 常见陷阱

| Babel 陷阱 | OXC 对应 | 解决方案 |
|-----------|---------|----------|
| 循环引用 | 借用检查 | 使用 `Arc<Mutex<T>>` 或重新设计 |
| 节点复用 | 所有权移动 | 克隆或使用引用 |
| 异步操作 | 同步执行 | 预处理所有异步数据 |
| 动态类型 | 静态类型 | 全面类型设计 |

---

## 附录 A：OXC 0.123.0 迁移指南

### 变更概览

```rust
// 旧签名 (0.121 及之前)
traverse_mut(pass, allocator, program)

// 新签名 (0.122+)
traverse_mut(
    allocator: &'a Allocator,
    program: &'s mut Program<'a>,
    scoping: Scoping<'s, 'ast>,
    state: P,
)
```

### 完整迁移示例

```rust
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::SourceType;
use oxc_traverse::{traverse_mut, Traverse, TraverseCtx};

pub fn compile(source: &str, config: JsxConfig) -> Result<String, Error> {
    let allocator = Allocator::default();
    
    // 解析
    let ret = Parser::new(&allocator, source, SourceType::jsx()).parse();
    if ret.errors.has_errors() {
        return Err(Error::Parse(ret.errors));
    }
    let mut program = ret.program;
    
    // 语义分析 (关键！)
    let semantic = SemanticBuilder::new()
        .with_cfg(true)
        .build(&program);
    
    // 创建状态
    let state = JsxCompilerState::new(config);
    
    // 新签名遍历
    traverse_mut::<JsxCompilerPass>(
        &allocator,
        &mut program,
        semantic.scoping,
        state,
    );
    
    // 代码生成
    let code = oxc_codegen::Codegen::<&str>::new()
        .build(&program)
        .source_text;
    
    Ok(code)
}
```

---

## 附录 B：关键类型转换表

| Babel (`@babel/types`) | OXC (`oxc_ast`) | 说明 |
|------------------------|-----------------|------|
| `t.identifier(name)` | `ast.identifier_reference(name)` | 标识符 |
| `t.stringLiteral(value)` | `ast.string_literal(value)` | 字符串 |
| `t.numericLiteral(value)` | `ast.number_literal(value)` | 数字 |
| `t.booleanLiteral(value)` | `ast.boolean_literal(value)` | 布尔 |
| `t.nullLiteral()` | `ast.null_literal()` | null |
| `t.arrayExpression(elements)` | `ast.array_expression(elements)` | 数组 |
| `t.objectExpression(properties)` | `ast.object_expression(properties)` | 对象 |
| `t.callExpression(callee, args)` | `ast.call_expression(callee, args)` | 调用 |
| `t.memberExpression(obj, prop)` | `ast.member_expression(obj, prop)` | 成员 |
| `t.arrowFunctionExpression(params, body)` | `ast.arrow_function_expression(params, body)` | 箭头函数 |
| `t.functionExpression(params, body)` | `ast.function_expression(params, body)` | 函数 |
| `t.blockStatement(body)` | `ast.block_statement(body)` | 代码块 |
| `t.returnStatement(arg)` | `ast.statement_return(arg)` | return |
| `t.variableDeclaration(kind, declarations)` | `ast.variable_declaration(kind, declarations)` | 变量声明 |
| `t.variableDeclarator(id, init)` | `ast.variable_declarator(id, init)` | 变量声明符 |
| `t.assignmentExpression(op, left, right)` | `ast.expression_assignment(op, left, right)` | 赋值 |
| `t.binaryExpression(op, left, right)` | `ast.expression_binary(op, left, right)` | 二元运算 |
| `t.logicalExpression(op, left, right)` | `ast.expression_logical(op, left, right)` | 逻辑运算 |
| `t.conditionalExpression(test, consequent, alternate)` | `ast.expression_conditional(test, consequent, alternate)` | 条件表达式 |
| `t.templateLiteral(quasis, expressions)` | `ast.template_literal(quasis, expressions)` | 模板字符串 |
| `t.spreadElement(argument)` | `ast.spread_element(argument)` | 展开 |
| `t.jsxElement(opening, children, closing)` | `JsxElement` | JSX 元素 |
| `t.jsxFragment(children)` | `JsxFragment` | JSX 片段 |

---

## 附录 C：参考资源

### Babel 资源
- [Babel 插件手册](https://github.com/jamiebuilds/babel-handbook)
- [@babel/types 文档](https://babeljs.io/docs/babel-types)
- [Babel 插件开发指南](https://babeljs.io/docs/plugins/)

### OXC 资源
- [OXC 官方文档](https://oxc.rs/)
- [oxc_ast API](https://docs.rs/oxc_ast/)
- [oxc_traverse API](https://docs.rs/oxc_traverse/)
- [oxc_codegen API](https://docs.rs/oxc_codegen/)

### dom-expressions 资源
- [dom-expressions GitHub](https://github.com/ryansolid/dom-expressions)
- [SolidJS 论坛](https://discourse.solidjs.com/)
