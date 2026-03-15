# Zeus 编译器 oxc_traverse 重构设计

## 1. 背景与问题分析

### 1.1 当前架构问题

当前 Zeus 编译器采用 **基于 Span 的字符串替换** 策略，存在以下核心问题：

```
┌─────────────────────────────────────────────────────────────────┐
│                    当前编译流程                                  │
├─────────────────────────────────────────────────────────────────┤
│  1. 解析 → AST                                                  │
│  2. 遍历找 JSX 位置 (Span)                                      │
│  3. 分析 JSX → TemplateIR                                       │
│  4. 生成替换代码 (String)                                        │
│  5. 按位置替换 → 最终代码                                        │
└─────────────────────────────────────────────────────────────────┘
```

**问题 1: 位置失效**
```rust
// 原始代码
if (error()) {
    return <Error />;  // Span: [20, 40]
}
return <Content />;

// JSX 编译后 (长度变化!)
if (error()) {
    return template("<!---->")();  // Span 仍然指向 [20, 40]，但内容已变
}
```

**问题 2: if-return 转换失败**
- if 语句的位置在 JSX 编译后发生变化
- 无法正确定位原始 if 语句进行 ternary 转换

**问题 3: 代码脆弱**
- 依赖字符串位置计算
- 边界条件容易出错
- 难以扩展新特性

### 1.2 为什么选择 oxc_traverse

`oxc_traverse` 是 oxc 官方的 AST 遍历框架，提供：

| 特性 | 说明 |
|-----|------|
| **安全遍历** | 自动处理 Rust 生命周期和借用规则 |
| **父子访问** | 可以访问父节点、祖先节点 |
| **直接修改** | 可以在遍历中直接替换 AST 节点 |
| **状态管理** | 内置状态管理机制 |

---

## 2. 重构目标

### 2.1 核心目标

1. **消除 Span 依赖**：不再依赖字符串位置进行代码替换
2. **真正的 AST 转换**：直接修改 AST 节点而非字符串操作
3. **简化控制流转换**：利用父节点信息简化 if-return → ternary 转换
4. **统一架构**：所有编译器使用相同的遍历框架

### 2.2 预期收益

- 更可靠的编译结果
- 更简单的代码维护
- 更易扩展新特性
- 更好的错误处理

---

## 3. 架构设计

### 3.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      新编译流程                                  │
├─────────────────────────────────────────────────────────────────┤
│  1. 解析 → AST                                                  │
│  2. oxc_traverse 遍历 + 转换                                    │
│     ├── enter_jsx_element  → 替换为函数调用                      │
│     ├── enter_if_statement → 检查并转换为 ternary                │
│     └── exit_jsx_element   → 收集绑定信息                        │
│  3. 代码生成 (Codegen)                                          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件

```rust
// ═══════════════════════════════════════════════════════════════
// 编译器 Pass Trait - 所有编译器实现的基础
// ═══════════════════════════════════════════════════════════════

/// 编译器 Pass Trait
/// 
/// 所有编译器（DOM、SSR、WebComponent）都实现此 trait
pub trait CompilerPass<'a, State> {
    /// 进入节点时的处理
    fn enter_program(&mut self, node: &mut Program<'a>, ctx: &mut TraverseCtx<'a, State>);
    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, State>);
    fn enter_jsx_fragment(&mut self, node: &mut JSXFragment<'a>, ctx: &mut TraverseCtx<'a, State>);
    fn enter_if_statement(&mut self, node: &mut IfStatement<'a>, ctx: &mut TraverseCtx<'a, State>);
    fn enter_call_expression(&mut self, node: &mut CallExpression<'a>, ctx: &mut TraverseCtx<'a, State>);
    
    /// 离开节点时的处理
    fn exit_jsx_element(&mut self, node: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, State>);
    fn exit_if_statement(&mut self, node: &mut IfStatement<'a>, ctx: &mut TraverseCtx<'a, State>);
}

// ═══════════════════════════════════════════════════════════════
// 编译结果
// ═══════════════════════════════════════════════════════════════

/// 编译结果
pub struct CompileResult {
    /// 生成的代码
    pub code: String,
    /// 使用的运行时 helpers
    pub used_helpers: Vec<String>,
    /// 委托事件列表
    pub delegated_events: Vec<String>,
    /// 警告信息
    pub warnings: Vec<Warning>,
}

// ═══════════════════════════════════════════════════════════════
// 编译器配置
// ═══════════════════════════════════════════════════════════════

/// 编译器选项
#[derive(Debug, Clone)]
pub struct CompilerOptions {
    /// 目标平台
    pub target: Target,
    /// 是否启用 JSX
    pub jsx: bool,
    /// 运行时模块
    pub runtime_module: Option<String>,
}

#[derive(Debug, Clone, Copy)]
pub enum Target {
    /// 浏览器 DOM
    Dom,
    /// 服务端渲染
    Ssr,
    /// Web Component
    WebComponent,
}
```

### 3.3 DOM 编译器实现

```rust
// ═══════════════════════════════════════════════════════════════
// DOM 编译器 Pass
// ═══════════════════════════════════════════════════════════════

/// DOM 编译器状态
pub struct DomCompilerState {
    /// 模板计数器
    pub template_counter: usize,
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl>,
    /// 委托事件
    pub delegated_events: Vec<String>,
    /// 使用的 helpers
    pub used_helpers: Vec<String>,
}

/// 单个模板声明
pub struct TemplateDecl {
    /// 模板变量名
    pub name: String,
    /// HTML 内容
    pub html: String,
    /// 绑定列表
    pub bindings: Vec<Binding>,
}

/// DOM 编译器 Pass
pub struct DomCompilerPass<'a> {
    state: DomCompilerState,
    source: &'a str,
}

impl<'a> DomCompilerPass<'a> {
    pub fn new(source: &'a str) -> Self {
        Self {
            state: DomCompilerState {
                template_counter: 0,
                templates: Vec::new(),
                delegated_events: Vec::new(),
                used_helpers: Vec::new(),
            },
            source,
        }
    }
}

impl<'a> CompilerPass<'a, DomCompilerState> for DomCompilerPass<'a> {
    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        // 1. 分析 JSX 元素
        let ir = self.analyze_jsx_element(node);
        
        // 2. 生成模板声明
        let template_var = self.generate_template(&ir);
        
        // 3. 生成元素创建代码
        let element_code = self.generate_element_code(&ir, &template_var);
        
        // 4. 创建新的 AST 节点替换原始 JSX
        let new_node = self.build_call_expression(element_code);
        
        // 5. 替换节点
        ctx.replace node.to_expression() with new_node;
    }
    
    fn enter_if_statement(&mut self, node: &mut IfStatement<'a>, ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        // 检查是否应该转换为 ternary
        if self.should_transform_to_ternary(node) {
            self.transform_to_ternary(node, ctx);
        }
    }
}
```

### 3.4 代码生成

```rust
// ═══════════════════════════════════════════════════════════════
// 代码生成器
// ═══════════════════════════════════════════════════════════════

/// 代码生成器
pub struct CodeGenerator {
    /// 当前缩进
    indent: usize,
    /// 输出缓冲
    buffer: String,
}

impl CodeGenerator {
    /// 从 AST 生成代码
    pub fn generate(program: &Program) -> String {
        let mut gen = Self::new();
        gen.visit_program(program);
        gen.finish()
    }
    
    /// 生成模板声明
    pub fn generate_template_decl(&mut self, decl: &TemplateDecl) {
        self.push_str(&format!(
            "const {} = template(\"{}\");\n",
            decl.name,
            decl.html
        ));
    }
    
    /// 生成 import 语句
    pub fn generate_imports(&mut self, helpers: &[String], module: &str) {
        if helpers.is_empty() {
            return;
        }
        self.push_str(&format!(
            "import {{ {} }} from \"{}\";\n",
            helpers.join(", "),
            module
        ));
    }
}
```

---

## 4. 关键技术实现

### 4.1 JSX 元素转换

```rust
impl<'a> DomCompilerPass<'a> {
    /// 将 JSX 元素转换为函数调用
    fn transform_jsx_element(&mut self, node: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, ()>) {
        // 1. 获取标签名
        let tag_name = self.get_tag_name(node);
        
        // 2. 判断是组件还是 DOM 元素
        let is_component = self.is_component(&tag_name);
        
        // 3. 分析模板（静态 HTML + 动态绑定）
        let ir = self.analyze_to_template_ir(node);
        
        // 4. 生成代码
        if is_component {
            // 组件：调用组件函数
            self.transform_component(node, &ir)
        } else {
            // DOM 元素：生成 template() + insert() 调用
            self.transform_element(node, &ir)
        }
        
        // 5. 使用 ctx.replace 替换节点
        // 注意：这里需要用 AstBuilder 创建新节点
    }
}
```

### 4.2 if-return → ternary 转换

这是 oxc_traverse 的核心优势：可以访问父节点。

```rust
impl<'a> DomCompilerPass<'a> {
    /// 检查是否应该转换为 ternary
    fn should_transform_to_ternary(&self, node: &IfStatement) -> bool {
        // 1. 条件包含信号调用（函数调用无参数）
        let has_signal = self.contains_signal_call(&node.test);
        
        // 2. then 分支返回 JSX
        let then_returns_jsx = self.returns_jsx(&node.consequent);
        
        // 3. else 分支返回 JSX（或隐式 else 返回 undefined）
        let else_returns_jsx = node.alternate
            .as_ref()
            .map_or(false, |alt| self.returns_jsx(alt));
        
        has_signal && then_returns_jsx && else_returns_jsx
    }
    
    /// 转换为 ternary 表达式
    fn transform_to_ternary(&mut self, node: &mut IfStatement, ctx: &mut TraverseCtx<'a, ()>) {
        // 1. 提取条件
        let condition = self.extract_expression_source(&node.test);
        
        // 2. 提取 then 分支（已经是转换后的 JSX）
        let then_expr = self.extract_return_expression(&node.consequent);
        
        // 3. 提取 else 分支
        let else_expr = node.alternate
            .as_ref()
            .and_then(|alt| self.extract_return_expression(alt))
            .unwrap_or_else(|| "undefined".to_string());
        
        // 4. 创建 ternary 表达式节点
        let ternary = self.builder.conditional_expression(
            node.span,
            node.test.clone(),
            then_expr,
            else_expr,
        );
        
        // 5. 替换整个 if 语句为 ternary 表达式
        // 需要访问父节点来确定替换位置
        if let Some(Ancestor::StatementListItemExpression(_)) = ctx.parent_kind() {
            ctx.replace node.to_expression() with ternary;
        }
    }
}
```

### 4.3 节点替换机制

```rust
// 使用 oxc_traverse 进行节点替换
use oxc_traverse::{Ancestor, TraverseCtx};

// 替换当前节点
ctx.replace old_node with new_node;

// 或者使用更细粒度的控制
match ctx.parent() {
    Ancestor::ExpressionStatementExpression(expr_stmt) => {
        // 替换表达式语句中的表达式
        expr_stmt.expression = new_expression;
    }
    Ancestor::ReturnStatementArgument(ret_stmt) => {
        // 替换返回值
        ret_stmt.argument = Some(new_expression);
    }
    _ => {}
}
```

---

## 5. 编译流水线

### 5.1 完整流水线

```rust
/// 编译函数
pub fn compile(source: &str, options: &CompilerOptions) -> Result<CompileResult, CompileError> {
    // 1. 初始化
    let allocator = Allocator::default();
    let source_type = SourceType::jsx();
    
    // 2. 解析
    let mut program = parse(&allocator, source, source_type)?;
    
    // 3. 根据目标选择 Pass
    match options.target {
        Target::Dom => {
            let mut pass = DomCompilerPass::new(source);
            traverse_mut(&mut pass, &allocator, &mut program, Scoping::default(), ());
            
            // 4. 代码生成
            let code = CodeGenerator::generate(&program);
            
            Ok(CompileResult {
                code,
                used_helpers: pass.state.used_helpers,
                delegated_events: pass.state.delegated_events,
                warnings: Vec::new(),
            })
        }
        Target::Ssr => { /* ... */ }
        Target::WebComponent => { /* ... */ }
    }
}
```

### 5.2 遍历顺序

```
程序遍历顺序 (深度优先):

Program
 └── StatementListItem (函数/变量声明)
      └── FunctionBody
           └── Statement
                └── IfStatement
                     ├── test: Expression
                     ├── consequent: BlockStatement
                     │    └── ReturnStatement
                     │         └── argument: JSXElement  ← enter_jsx_element
                     └── alternate: BlockStatement
                          └── ReturnStatement
                               └── argument: JSXElement  ← enter_jsx_element

节点处理顺序:
1. enter_if_statement
2. enter_jsx_element (then 分支)
3. exit_jsx_element
4. enter_jsx_element (else 分支)  
5. exit_jsx_element
6. exit_if_statement
```

---

## 6. SSR 和 WebComponent 扩展

### 6.1 SSR 编译器

SSR 编译器复用 DOM 编译器的大部分逻辑，但有不同的代码生成策略：

```rust
pub struct SsrCompilerPass {
    /// 继承 DOM 编译器的基础功能
    dom_pass: DomCompilerPass,
    /// SSR 特定状态
    ssr_state: SsrState,
}

impl CompilerPass<'a, SsrCompilerState> for SsrCompilerPass {
    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, SsrCompilerState>) {
        // 1. 先执行 DOM 分析
        self.dom_pass.enter_jsx_element(node, &mut ctx.as_dom());
        
        // 2. SSR 特定转换
        // - 生成 hydration 代码
        // - 生成序列化数据
    }
}
```

### 6.2 WebComponent 编译器

```rust
pub struct WebComponentCompilerPass {
    dom_pass: DomCompilerPass,
}

impl CompilerPass<'a, WebComponentState> for WebComponentCompilerPass {
    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, WebComponentState>) {
        // 1. 标准 DOM 转换
        self.dom_pass.enter_jsx_element(node, &mut ctx.as_dom());
        
        // 2. WebComponent 特定
        // - 自定义元素转换
        // - Shadow DOM 处理
    }
}
```

---

## 7. 实现计划

### 7.1 阶段 1: 基础设施（1 周）

- [ ] 完善 `CompilerPass` trait 定义
- [ ] 实现基础的 `traverse_mut` 调用
- [ ] 创建代码生成器框架

### 7.2 阶段 2: DOM 编译器（2 周）

- [ ] 实现 `DomCompilerPass`
- [ ] 实现 JSX 元素 → 函数调用转换
- [ ] 实现模板生成
- [ ] 测试基本功能

### 7.3 阶段 3: 控制流转换（1 周）

- [ ] 实现 if-return → ternary 转换
- [ ] 测试控制流场景

### 7.4 阶段 4: SSR/WebComponent（1 周）

- [ ] 实现 SSR 编译器
- [ ] 实现 WebComponent 编译器
- [ ] 完整测试

### 7.5 阶段 5: 优化（1 周）

- [ ] 性能优化
- [ ] 错误处理完善
- [ ] 文档完善

---

## 8. 迁移策略

### 8.1 渐进式迁移

1. **保留旧代码**: 暂时不删除旧的 Span-based 实现
2. **并行开发**: 新旧代码同时维护
3. **测试对比**: 确保新实现输出相同结果
4. **逐步替换**: 逐个功能切换到新架构

### 8.2 回滚计划

- 保留旧代码的 Git 分支
- 旧代码作为备选方案
- 确保 API 兼容性

---

## 9. 总结

使用 `oxc_traverse` 重构将带来：

1. **更可靠的编译**: 消除 Span 依赖，代码转换更准确
2. **更简单的控制流**: 父子节点访问简化 if-return 转换
3. **更好的扩展性**: 统一的 Pass 架构便于添加新编译器
4. **更易维护**: 直接操作 AST 而非字符串

通过本重构，Zeus 编译器将达到生产级质量。

---

*本文档最后更新于 2026 年 3 月*
