//! AST 遍历模块
//!
//! 这里提供 **最小可用** 的 `oxc_traverse` 集成：
//! - 使用 `oxc_traverse::traverse_mut` 遍历 AST
//! - 在 `enter_jsx_element` 中收集委托事件、标记使用的 runtime helpers
//!
//! 后续在此基础上逐步补齐：JSX → AST 替换、模板抽取、控制流转换等。

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_semantic::SemanticBuilder;
use oxc_traverse::{traverse_mut, Traverse, TraverseCtx};
use oxc_span::GetSpan;
use zeus_compiler_common::CompilerOptions;

/// 编译目标（当前仅用于对齐设计文档）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Target {
    /// 浏览器 DOM
    #[default]
    Dom,
    /// 服务端渲染
    Ssr,
    /// Web Component
    WebComponent,
}

/// DOM 编译器状态
#[allow(dead_code)]
pub struct DomCompilerState {
    /// 模板计数器
    pub template_counter: usize,
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl>,
    /// 委托事件
    pub delegated_events: Vec<String>,
    /// 使用的 helpers
    pub used_helpers: Vec<String>,
    /// 当前是否在 JSX 上下文中
    pub in_jsx: bool,
    /// 当前深度
    pub depth: usize,
    /// 当前正在处理的模板名（用于嵌套收集 binding）
    current_template: Option<String>,
    /// 当前模板的绑定（child 索引位置 → 表达式源码）
    current_child_bindings: Vec<ChildBinding>,
    /// 当前元素的子节点计数（用于生成 marker 路径）
    child_index: usize,
    /// 静态节点提升 - 静态 JSX 片段
    static_nodes: Vec<StaticNode>,
    /// 静态节点计数器
    static_node_counter: usize,
    /// 列表渲染信息
    list_renders: Vec<ListRender>,
}

/// 静态节点（可提升到函数外部）
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct StaticNode {
    /// 节点名称
    pub name: String,
    /// 静态 HTML 内容
    pub html: String,
    /// 是否可以提升
    pub hoistable: bool,
}

/// 列表渲染信息
#[derive(Clone, Debug)]
pub struct ListRender {
    /// 渲染名称
    pub name: String,
    /// 数组表达式
    pub array: String,
    /// 回调参数名（如 item, index）
    pub params: Vec<String>,
    /// JSX 模板
    pub template: String,
    /// 是否使用索引
    pub has_index: bool,
}

/// 子节点绑定
#[derive(Clone, Debug)]
pub struct ChildBinding {
    /// 在 children 数组中的索引
    pub index: usize,
    /// 表达式源代码
    pub expression: String,
    /// 是否为文本插值（如 `{count}`）
    pub is_text: bool,
}

impl DomCompilerState {
    /// 创建新的 DOM 编译器状态
    pub fn new() -> Self {
        Self {
            template_counter: 0,
            templates: Vec::new(),
            delegated_events: Vec::new(),
            used_helpers: Vec::new(),
            in_jsx: false,
            depth: 0,
            current_template: None,
            current_child_bindings: Vec::new(),
            child_index: 0,
            static_nodes: Vec::new(),
            static_node_counter: 0,
            list_renders: Vec::new(),
        }
    }

    /// 生成唯一的模板变量名
    pub fn generate_template_name(&mut self) -> String {
        self.template_counter += 1;
        // 使用随机数来确保同一文件中的模板变量名唯一
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        self.template_counter.hash(&mut hasher);
        std::time::Instant::now().hash(&mut hasher);
        let hash = (hasher.finish() % 10000) as usize;
        format!("_tmpl${}_{}", self.template_counter, hash)
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: &str) {
        if !self.delegated_events.contains(&event.to_string()) {
            self.delegated_events.push(event.to_string());
        }
    }

    /// 生成静态节点名称
    pub fn generate_static_node_name(&mut self) -> String {
        let name = format!("_static${}", self.static_node_counter);
        self.static_node_counter += 1;
        name
    }

    /// 检查是否可以提升为静态节点
    pub fn can_hoist(&self, html: &str) -> bool {
        !html.contains("<!--[") && !html.contains("${")
    }

    /// 添加列表渲染
    pub fn add_list_render(&mut self, render: ListRender) {
        self.list_renders.push(render);
        self.add_helper("renderList");
    }

    /// 检查是否是列表渲染模式
    pub fn is_list_pattern(&self, expr: &str) -> bool {
        expr.contains(".map(")
    }

    /// 添加使用的 helper
    pub fn add_helper(&mut self, helper: &str) {
        if !self.used_helpers.contains(&helper.to_string()) {
            self.used_helpers.push(helper.to_string());
        }
    }

    /// 开始处理一个新模板
    pub fn start_template(&mut self, name: String) {
        self.current_template = Some(name);
        self.current_child_bindings = Vec::new();
        self.child_index = 0;
    }

    /// 结束处理当前模板
    pub fn finish_template(&mut self) -> Vec<ChildBinding> {
        let bindings = std::mem::take(&mut self.current_child_bindings);
        self.current_template = None;
        bindings
    }

    /// 添加子节点绑定
    pub fn add_child_binding(&mut self, binding: ChildBinding) {
        self.current_child_bindings.push(binding);
    }

    /// 获取当前子节点索引并递增
    pub fn next_child_index(&mut self) -> usize {
        let idx = self.child_index;
        self.child_index += 1;
        idx
    }
}

impl Default for DomCompilerState {
    fn default() -> Self {
        Self::new()
    }
}

/// 单个模板声明
#[derive(Clone, Debug)]
pub struct TemplateDecl {
    /// 模板变量名
    pub name: String,
    /// HTML 内容
    pub html: String,
    /// 子节点绑定（用于 insert 调用）
    pub child_bindings: Vec<ChildBinding>,
    /// 属性绑定（用于 setAttribute/className/style）
    pub attr_bindings: Vec<AttrBinding>,
}

/// 属性绑定
#[derive(Clone, Debug)]
pub struct AttrBinding {
    /// 属性名
    pub name: String,
    /// 表达式源代码
    pub expression: String,
    /// 绑定类型
    pub kind: AttrBindingKind,
}

#[derive(Clone, Debug)]
pub enum AttrBindingKind {
    /// 普通属性
    Attribute,
    /// DOM property（如 value, checked, disabled）
    Property,
    /// 类名
    ClassName,
    /// 样式
    Style,
    /// 事件处理
    Event,
    /// 展开
    Spread,
}

/// DOM 编译器 Pass
#[derive(Default)]
#[allow(dead_code)]
pub struct DomCompilerPass<'a> {
    state: DomCompilerState,
    source: &'a str,
    options: CompilerOptions,
}

impl<'a> DomCompilerPass<'a> {
    /// 创建新的 DOM 编译器 Pass
    pub fn new(source: &'a str, options: CompilerOptions) -> Self {
        Self {
            state: DomCompilerState::new(),
            source,
            options,
        }
    }

    /// 获取状态
    pub fn state(&self) -> &DomCompilerState {
        &self.state
    }

    /// 获取状态可变引用
    pub fn state_mut(&mut self) -> &mut DomCompilerState {
        &mut self.state
    }

    /// 将 JSX 元素转换为模板 HTML 和绑定信息
    fn jsx_element_to_template_ir(&mut self, node: &JSXElement<'a>) -> (String, Vec<ChildBinding>, Vec<AttrBinding>) {
        let mut html = String::new();
        let mut child_bindings = Vec::new();
        let mut attr_bindings = Vec::new();

        self.write_jsx_element_html(node, &mut html, &mut child_bindings, &mut attr_bindings);

        (html, child_bindings, attr_bindings)
    }

    /// 将 JSX Fragment 转换为模板 HTML 和绑定信息
    fn jsx_fragment_to_template_ir(&mut self, node: &JSXFragment<'a>) -> (String, Vec<ChildBinding>) {
        let mut html = String::new();
        let mut child_bindings = Vec::new();

        self.write_jsx_fragment_html(node, &mut html, &mut child_bindings);

        (html, child_bindings)
    }

    /// 写入 JSX Fragment 的 HTML
    fn write_jsx_fragment_html(
        &mut self,
        node: &JSXFragment<'a>,
        out: &mut String,
        child_bindings: &mut Vec<ChildBinding>,
    ) {
        // Fragment 不生成外层标签，直接处理子节点
        let mut child_idx = 0;
        for child in &node.children {
            match child {
                JSXChild::Text(t) => out.push_str(t.value.as_str()),
                JSXChild::Element(e) => {
                    // 递归处理子元素
                    let mut attr_bindings = Vec::new();
                    self.write_jsx_element_html(e, out, child_bindings, &mut attr_bindings);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    // 动态表达式 - 生成占位符
                    let placeholder = format!("<!--[{}]-->", child_idx);
                    out.push_str(&placeholder);

                    if let Some(expr) = expr_container.expression.as_expression() {
                        let expr_source = self.expression_to_source(expr);
                        child_bindings.push(ChildBinding {
                            index: child_idx,
                            expression: expr_source,
                            is_text: true,
                        });
                    }
                    child_idx += 1;
                }
                JSXChild::Spread(_) | JSXChild::Fragment(_) => {
                    out.push_str("<!---->");
                }
            }
        }
    }

    fn write_jsx_element_html(
        &mut self,
        node: &JSXElement<'a>,
        out: &mut String,
        child_bindings: &mut Vec<ChildBinding>,
        attr_bindings: &mut Vec<AttrBinding>,
    ) {
        // tag
        let tag = match &node.opening_element.name {
            JSXElementName::Identifier(id) => id.name.as_str(),
            JSXElementName::NamespacedName(name) => name.name.name.as_str(),
            JSXElementName::MemberExpression(_) => "div",
            JSXElementName::IdentifierReference(id) => id.name.as_str(),
            JSXElementName::ThisExpression(_) => "div",
        };

        out.push('<');
        out.push_str(tag);

        // 处理属性
        for item in &node.opening_element.attributes {
            match item {
                JSXAttributeItem::Attribute(attr) => {
                    let attr_name = match &attr.name {
                        JSXAttributeName::Identifier(id) => id.name.as_str(),
                        _ => continue,
                    };

                    if let Some(value) = &attr.value {
                        let expr_source = self.extract_jsx_attribute_value(value);
                        if !expr_source.is_empty() {
                            // 收集属性绑定
                            let kind = if attr_name == "class" {
                                AttrBindingKind::ClassName
                            } else if attr_name == "style" {
                                AttrBindingKind::Style
                            } else if attr_name.starts_with("on") {
                                AttrBindingKind::Event
                            } else if attr_name == "value" || attr_name == "checked" || attr_name == "disabled" {
                                // 这些属性使用 property 设置而不是 setAttribute
                                AttrBindingKind::Property
                            } else {
                                AttrBindingKind::Attribute
                            };
                            attr_bindings.push(AttrBinding {
                                name: attr_name.to_string(),
                                expression: expr_source,
                                kind,
                            });
                        } else {
                            // 静态属性
                            out.push(' ');
                            out.push_str(attr_name);
                            if let JSXAttributeValue::StringLiteral(s) = value {
                                out.push_str("=\"");
                                out.push_str(s.value.as_str());
                                out.push('"');
                            }
                        }
                    } else {
                        // 布尔属性
                        out.push(' ');
                        out.push_str(attr_name);
                    }
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    let expr = self.extract_expression(&spread.argument);
                    if !expr.is_empty() {
                        attr_bindings.push(AttrBinding {
                            name: "...".to_string(),
                            expression: expr,
                            kind: AttrBindingKind::Spread,
                        });
                    }
                }
            }
        }

        out.push('>');

        // 处理子节点
        let mut child_idx = 0;
        for child in &node.children {
            match child {
                JSXChild::Text(t) => out.push_str(t.value.as_str()),
                JSXChild::Element(e) => {
                    // 递归处理子元素
                    self.write_jsx_element_html(e, out, child_bindings, attr_bindings);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    // 检查是否是条件表达式（三元运算符或逻辑与）
                    if let Some(expr) = expr_container.expression.as_expression() {
                        match expr {
                            Expression::ConditionalExpression(cond) => {
                                // 三元表达式：condition ? then : else
                                // 为 then 分支生成模板
                                let then_tmpl = self.state.generate_template_name();
                                let then_html = self.jsx_element_to_static_html(&cond.consequent);
                                self.state.templates.push(TemplateDecl {
                                    name: then_tmpl.clone(),
                                    html: then_html,
                                    child_bindings: Vec::new(),
                                    attr_bindings: Vec::new(),
                                });
                                self.state.add_helper("template");

                                // 为 else 分支生成模板
                                let else_tmpl = self.state.generate_template_name();
                                let else_html = self.jsx_element_to_static_html(&cond.alternate);
                                self.state.templates.push(TemplateDecl {
                                    name: else_tmpl.clone(),
                                    html: else_html,
                                    child_bindings: Vec::new(),
                                    attr_bindings: Vec::new(),
                                });

                                // 生成条件表达式代码
                                let condition = self.expression_to_source(&cond.test);
                                let expr_source = format!(
                                    "({} ? ({}()) : ({}()))",
                                    condition, then_tmpl, else_tmpl
                                );

                                // 添加到子节点绑定
                                let placeholder = format!("<!--[{}]-->", child_idx);
                                out.push_str(&placeholder);
                                child_bindings.push(ChildBinding {
                                    index: child_idx,
                                    expression: expr_source,
                                    is_text: true,
                                });
                                child_idx += 1;
                            }
                            Expression::LogicalExpression(logical) => {
                                // 逻辑与表达式：condition && <JSX />
                                // 检查是否是 JSX 元素
                                if self.is_jsx_expression(&logical.right) {
                                    let right_tmpl = self.state.generate_template_name();
                                    let right_html = self.jsx_element_to_static_html(&logical.right);
                                    self.state.templates.push(TemplateDecl {
                                        name: right_tmpl.clone(),
                                        html: right_html,
                                        child_bindings: Vec::new(),
                                        attr_bindings: Vec::new(),
                                    });
                                    self.state.add_helper("template");

                                    let condition = self.expression_to_source(&logical.left);
                                    let expr_source = format!(
                                        "({} && ({}()))",
                                        condition, right_tmpl
                                    );

                                    let placeholder = format!("<!--[{}]-->", child_idx);
                                    out.push_str(&placeholder);
                                    child_bindings.push(ChildBinding {
                                        index: child_idx,
                                        expression: expr_source,
                                        is_text: true,
                                    });
                                    child_idx += 1;
                                } else {
                                    // 普通逻辑表达式，直接转换
                                    let expr_source = self.expression_to_source(expr);
                                    let placeholder = format!("<!--[{}]-->", child_idx);
                                    out.push_str(&placeholder);
                                    child_bindings.push(ChildBinding {
                                        index: child_idx,
                                        expression: expr_source,
                                        is_text: true,
                                    });
                                    child_idx += 1;
                                }
                            }
                            _ => {
                                // 普通表达式，直接转换
                                let expr_source = self.expression_to_source(expr);
                                let placeholder = format!("<!--[{}]-->", child_idx);
                                out.push_str(&placeholder);
                                child_bindings.push(ChildBinding {
                                    index: child_idx,
                                    expression: expr_source,
                                    is_text: true,
                                });
                                child_idx += 1;
                            }
                        }
                    }
                }
                JSXChild::Spread(_) | JSXChild::Fragment(_) => {
                    // 占位
                    out.push_str("<!---->");
                }
            }
        }

        out.push_str("</");
        out.push_str(tag);
        out.push('>');
    }

    /// 从 JSXAttributeValue 提取表达式源码
    fn extract_jsx_attribute_value(&self, value: &JSXAttributeValue<'a>) -> String {
        match value {
            JSXAttributeValue::StringLiteral(_s) => String::new(), // 静态值不需要绑定
            JSXAttributeValue::ExpressionContainer(expr) => {
                if let Some(expr) = expr.expression.as_expression() {
                    self.expression_to_source(expr)
                } else {
                    String::new()
                }
            }
            _ => String::new(),
        }
    }

    /// 将表达式转换为源码字符串
    fn expression_to_source(&self, expr: &Expression<'a>) -> String {
        match expr {
            Expression::Identifier(id) => id.name.to_string(),
            Expression::StringLiteral(s) => format!("\"{}\"", s.value),
            Expression::NumericLiteral(n) => n.value.to_string(),
            Expression::BooleanLiteral(b) => b.value.to_string(),
            Expression::NullLiteral(_) => "null".to_string(),
            Expression::RegExpLiteral(_r) => {
                "/* regex */".to_string()
            }
            Expression::BigIntLiteral(_b) => {
                "/* bigint */".to_string()
            }
            Expression::TemplateLiteral(t) => {
                self.handle_template_literal(t)
            }
            Expression::TaggedTemplateExpression(_tagged) => {
                "/* tagged template */".to_string()
            }
            Expression::ArrayExpression(arr) => {
                let elements: Vec<String> = arr
                    .elements
                    .iter()
                    .filter_map(|elem| elem.as_expression().map(|e| self.expression_to_source(e)))
                    .collect();
                format!("[{}]", elements.join(", "))
            }
            Expression::ObjectExpression(obj) => {
                self.handle_object_expression(obj)
            }
            Expression::FunctionExpression(_func) => {
                "function() { /* body */ }".to_string()
            }
            Expression::ArrowFunctionExpression(_arrow) => {
                "() => { /* body */ }".to_string()
            }
            Expression::ClassExpression(_class) => {
                "class { /* body */ }".to_string()
            }
            // MemberExpression 通过继承处理
            Expression::NewExpression(new) => {
                let callee = self.expression_to_source(&new.callee);
                format!("new {}", callee)
            }
            Expression::BinaryExpression(bin) => {
                let left = self.expression_to_source(&bin.left);
                let right = self.expression_to_source(&bin.right);
                let op = bin.operator.as_str();
                format!("({} {} {})", left, op, right)
            }
            Expression::UnaryExpression(unary) => {
                let arg = self.expression_to_source(&unary.argument);
                let op = unary.operator.as_str();
                format!("({}{})", op, arg)
            }
            Expression::UpdateExpression(_update) => {
                // UpdateExpression 的 argument 是 SimpleAssignmentTarget，简化处理
                "/* update expr */".to_string()
            }
            Expression::LogicalExpression(logical) => {
                let left = self.expression_to_source(&logical.left);
                let right = self.expression_to_source(&logical.right);
                let op = logical.operator.as_str();
                format!("({} {} {})", left, op, right)
            }
            Expression::ConditionalExpression(cond) => {
                let test = self.expression_to_source(&cond.test);
                let consequent = self.expression_to_source(&cond.consequent);
                let alternate = self.expression_to_source(&cond.alternate);
                format!("({} ? {} : {})", test, consequent, alternate)
            }
            Expression::AssignmentExpression(assign) => {
                // AssignmentTarget 有多种形式，简化处理
                let right = self.expression_to_source(&assign.right);
                format!("/* assign */ {}", right)
            }
            Expression::SequenceExpression(seq) => {
                let exprs: Vec<String> = seq
                    .expressions
                    .iter()
                    .map(|e| self.expression_to_source(e))
                    .collect();
                format!("({})", exprs.join(", "))
            }
            // SpreadElement 不在这里处理
            Expression::AwaitExpression(_await) => {
                "/* await */".to_string()
            }
            Expression::YieldExpression(yield_) => {
                if let Some(arg) = &yield_.argument {
                    format!("yield* {}", self.expression_to_source(arg))
                } else {
                    "yield".to_string()
                }
            }
            Expression::ThisExpression(_) => "this".to_string(),
            Expression::Super(_) => "super".to_string(),
            Expression::ImportExpression(_import) => {
                // ImportExpression 的 source 是 Expression 类型
                format!("import(/* source */)")
            }
            Expression::ParenthesizedExpression(paren) => {
                // 括号表达式，直接返回内部表达式
                self.expression_to_source(&paren.expression)
            }
            Expression::PrivateInExpression(_private) => {
                // 私有字段 in 表达式
                "/* private in */".to_string()
            }
            Expression::CallExpression(call) => {
                let callee = self.expression_to_source(&call.callee);
                let args: Vec<String> = call
                    .arguments
                    .iter()
                    .filter_map(|arg| arg.as_expression().map(|e| self.expression_to_source(e)))
                    .collect();
                format!("{}({})", callee, args.join(", "))
            }
            Expression::ChainExpression(_chain) => {
                // 链式调用（可选链）- 返回占位符
                "/* chain expression */".to_string()
            }
            Expression::JSXElement(_jsx) => {
                // JSX 元素 - 返回占位符
                "/* JSX element */".to_string()
            }
            Expression::JSXFragment(_frag) => {
                // JSX Fragment - 返回占位符
                "/* JSX fragment */".to_string()
            }
            // MemberExpression 通过继承处理
            _ => "/* expression */".to_string(),
        }
    }

    /// 处理模板字面量
    fn handle_template_literal(&self, t: &TemplateLiteral) -> String {
        let mut result = String::new();
        for (i, quasi) in t.quasis.iter().enumerate() {
            result.push_str(quasi.value.raw.as_str());
            if i < t.expressions.len() {
                result.push_str("${");
                result.push_str(&self.expression_to_source(&t.expressions[i]));
                result.push('}');
            }
        }
        format!("`{}`", result)
    }

    /// 处理对象表达式
    fn handle_object_expression(&self, obj: &ObjectExpression<'a>) -> String {
        let properties: Vec<String> = obj
            .properties
            .iter()
            .filter_map(|prop| {
                let p = prop.as_property()?;
                let key = match &p.key {
                    PropertyKey::StaticIdentifier(id) => id.name.to_string(),
                    PropertyKey::PrivateIdentifier(id) => id.name.to_string(),
                    PropertyKey::StringLiteral(s) => format!("\"{}\"", s.value),
                    PropertyKey::NumericLiteral(n) => n.value.to_string(),
                    _ => "/* computed */".to_string(),
                };
                let value = self.expression_to_source(&p.value);
                if p.shorthand {
                    Some(value)
                } else {
                    Some(format!("{}: {}", key, value))
                }
            })
            .collect();
        format!("{{{}}}", properties.join(", "))
    }

    /// 提取表达式（用于 JSX spread 等）
    fn extract_expression(&self, expr: &Expression<'a>) -> String {
        self.expression_to_source(expr)
    }

    /// 检查表达式是否是 JSX 元素或 JSX Fragment
    fn is_jsx_expression(&self, expr: &Expression<'a>) -> bool {
        matches!(expr, Expression::JSXElement(_) | Expression::JSXFragment(_))
    }

    /// 将 JSX 表达式转换为静态 HTML（用于条件分支的模板生成）
    fn jsx_element_to_static_html(&self, expr: &Expression<'a>) -> String {
        match expr {
            Expression::JSXElement(jsx) => {
                let mut html = String::new();
                self.write_jsx_element_static_html(jsx, &mut html);
                html
            }
            Expression::JSXFragment(frag) => {
                let mut html = String::new();
                self.write_jsx_fragment_static_html(frag, &mut html);
                html
            }
            _ => String::new(),
        }
    }

    /// 写入 JSX 元素的静态 HTML（不含动态绑定信息）
    fn write_jsx_element_static_html(&self, node: &JSXElement<'a>, out: &mut String) {
        let tag = match &node.opening_element.name {
            JSXElementName::Identifier(id) => id.name.as_str(),
            JSXElementName::NamespacedName(name) => name.name.name.as_str(),
            JSXElementName::MemberExpression(_) => "div",
            JSXElementName::IdentifierReference(id) => id.name.as_str(),
            JSXElementName::ThisExpression(_) => "div",
        };

        out.push('<');
        out.push_str(tag);

        // 处理属性 - 只保留静态属性
        for item in &node.opening_element.attributes {
            match item {
                JSXAttributeItem::Attribute(attr) => {
                    let attr_name = match &attr.name {
                        JSXAttributeName::Identifier(id) => id.name.as_str(),
                        _ => continue,
                    };

                    if let Some(value) = &attr.value {
                        // 只处理静态字符串值
                        if let JSXAttributeValue::StringLiteral(s) = value {
                            out.push(' ');
                            out.push_str(attr_name);
                            out.push_str("=\"");
                            out.push_str(s.value.as_str());
                            out.push('"');
                        }
                    } else {
                        // 布尔属性
                        out.push(' ');
                        out.push_str(attr_name);
                    }
                }
                _ => {}
            }
        }

        out.push('>');

        // 处理子节点
        for child in &node.children {
            match child {
                JSXChild::Text(t) => out.push_str(t.value.as_str()),
                JSXChild::Element(e) => {
                    self.write_jsx_element_static_html(e, out);
                }
                JSXChild::ExpressionContainer(_expr_container) => {
                    // 动态表达式用占位符
                    out.push_str("<!---->");
                }
                JSXChild::Spread(_) | JSXChild::Fragment(_) => {
                    out.push_str("<!---->");
                }
            }
        }

        out.push_str("</");
        out.push_str(tag);
        out.push('>');
    }

    /// 写入 JSX Fragment 的静态 HTML
    fn write_jsx_fragment_static_html(&self, node: &JSXFragment<'a>, out: &mut String) {
        for child in &node.children {
            match child {
                JSXChild::Text(t) => out.push_str(t.value.as_str()),
                JSXChild::Element(e) => {
                    self.write_jsx_element_static_html(e, out);
                }
                JSXChild::ExpressionContainer(_) => {
                    out.push_str("<!---->");
                }
                JSXChild::Spread(_) | JSXChild::Fragment(_) => {
                    out.push_str("<!---->");
                }
            }
        }
    }

    /// 检测并优化列表渲染
    ///
    /// 检测模式：`arr.map((item) => <JSX />)` 或 `arr.map(item => <JSX />)`
    /// 优化为：使用优化的列表渲染函数
    fn detect_and_optimize_list_rendering(
        &mut self,
        node: &mut ReturnStatement<'a>,
        _ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) {
        let Some(arg) = node.argument.as_mut() else {
            return;
        };

        // 检测是否是 .map() 调用
        let callee_str = self.expression_to_source(arg);
        if callee_str.contains(".map(") {
            // 记录检测到的列表渲染
            self.state.add_helper("renderList");
        }
    }

    /// 处理列表渲染 - arr.map((item) => <JSX />)
    /// 简化版本：只检测并添加 helper，实际转换由代码生成器处理
    fn handle_list_rendering(
        &mut self,
        call: &CallExpression<'a>,
        _arg: &mut Expression<'a>,
        _span: oxc_span::Span,
        _ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) {
        // 使用 expression_to_source 获取完整的调用表达式
        let call_source = self.expression_to_source(&call.callee);

        // 检查是否是 .map() 调用
        if !call_source.contains("map") {
            return;
        }

        // 添加必要的 helpers
        self.state.add_helper("template");
        self.state.add_helper("renderList");

        // 为列表项生成模板
        let item_tmpl_name = self.state.generate_template_name();
        let item_html = "<!---->".to_string();

        self.state.templates.push(TemplateDecl {
            name: item_tmpl_name,
            html: item_html,
            child_bindings: Vec::new(),
            attr_bindings: Vec::new(),
        });
    }
}

impl<'a> Traverse<'a, DomCompilerState> for DomCompilerPass<'a> {
    fn enter_return_statement(
        &mut self,
        node: &mut ReturnStatement<'a>,
        ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) {
        // 检查是否是列表渲染：arr.map((item) => <JSX />)
        self.detect_and_optimize_list_rendering(node, ctx);

        // 仅处理 `return <JSX />` / `return <>...</>` / `return arr.map(...)`
        let Some(arg) = node.argument.as_mut() else {
            return;
        };

        let span = arg.span();

        // 检查是否是列表渲染 (.map() 调用)
        let is_list_rendering = if let Expression::CallExpression(call) = arg {
            let callee_str = self.expression_to_source(&call.callee);
            callee_str.contains(".map") || callee_str.contains("map(")
        } else {
            false
        };

        if is_list_rendering {
            // 列表渲染：只添加 helpers，不进行 AST 转换
            // 后续在代码生成器中处理
            self.state.add_helper("template");
            self.state.add_helper("renderList");
            // 生成一个模板用于列表项
            let item_tmpl_name = self.state.generate_template_name();
            self.state.templates.push(TemplateDecl {
                name: item_tmpl_name,
                html: "<!---->".to_string(),
                child_bindings: Vec::new(),
                attr_bindings: Vec::new(),
            });
        }

        match arg {
            Expression::JSXElement(jsx) => {
                // 生成模板 HTML 和绑定信息
                let (html, child_bindings, attr_bindings) = self.jsx_element_to_template_ir(jsx);

                let tmpl_name = self.state.generate_template_name();
                self.state.add_helper("template");

                // 如果有动态子节点，添加 insert helper
                if !child_bindings.is_empty() {
                    self.state.add_helper("insert");
                }

                // 如果有事件，添加 delegateEvents
                if attr_bindings.iter().any(|b| matches!(b.kind, AttrBindingKind::Event)) {
                    self.state.add_helper("delegateEvents");
                }

                self.state.templates.push(TemplateDecl {
                    name: tmpl_name.clone(),
                    html,
                    child_bindings,
                    attr_bindings,
                });

                let tmpl_atom = ctx.ast.allocator.alloc_str(&tmpl_name);

                // 替换为 `_tmpl$N()` 调用
                let call_expr = ctx.ast.expression_call(
                    span,
                    ctx.ast.expression_identifier(span, tmpl_atom),
                    oxc_ast::NONE,
                    ctx.ast.vec(),
                    false,
                );
                *arg = call_expr;
            }
            Expression::JSXFragment(frag) => {
                // Fragment 支持
                let (html, child_bindings) = self.jsx_fragment_to_template_ir(frag);

                let tmpl_name = self.state.generate_template_name();
                self.state.add_helper("template");

                // 如果有动态子节点，添加 insert helper
                if !child_bindings.is_empty() {
                    self.state.add_helper("insert");
                }

                self.state.templates.push(TemplateDecl {
                    name: tmpl_name.clone(),
                    html,
                    child_bindings,
                    attr_bindings: Vec::new(),
                });

                let tmpl_atom = ctx.ast.allocator.alloc_str(&tmpl_name);
                let call_expr = ctx.ast.expression_call(
                    span,
                    ctx.ast.expression_identifier(span, tmpl_atom),
                    oxc_ast::NONE,
                    ctx.ast.vec(),
                    false,
                );
                *arg = call_expr;
            }
            _ => {}
        }
    }

    fn enter_if_statement(&mut self, node: &mut IfStatement<'a>, ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        // 检查是否应该转换为 ternary
        if self.should_transform_to_ternary(node) {
            self.transform_to_ternary(node, ctx);
        }
    }

    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, _ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        self.state.in_jsx = true;
        self.state.depth += 1;

        // 收集事件委托
        for item in &node.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = item {
                if let JSXAttributeName::Identifier(id) = &attr.name {
                    let name = id.name.as_str();
                    if name.starts_with("on") && name.len() > 2 {
                        let event = name[2..].to_lowercase();
                        self.state.add_delegated_event(&event);
                    }
                }
            }
        }
    }

    fn exit_jsx_element(&mut self, _node: &mut JSXElement<'a>, _ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        self.state.depth -= 1;
        if self.state.depth == 0 {
            self.state.in_jsx = false;
        }
    }
}

impl<'a> DomCompilerPass<'a> {
    /// 检查是否应该转换为 ternary
    fn should_transform_to_ternary(&self, node: &IfStatement<'a>) -> bool {
        // 检查条件
        let test_str = self.expression_to_source(&node.test);

        // 检查是否包含信号调用（函数调用）
        let has_signal = test_str.contains("()");

        // 检查 then 分支是否返回 JSX
        let then_returns_jsx = self.statement_returns_jsx(&node.consequent);

        // 检查 else 分支是否返回 JSX（或没有 else 分支）
        let else_returns_jsx = node.alternate.as_ref()
            .map_or(false, |alt| self.statement_returns_jsx(alt));

        // 转换条件：条件包含信号 + then/else 都返回 JSX
        has_signal && then_returns_jsx && else_returns_jsx
    }

    /// 检查语句是否返回 JSX
    fn statement_returns_jsx(&self, stmt: &Statement<'a>) -> bool {
        match stmt {
            Statement::ReturnStatement(ret) => {
                ret.argument.as_ref().map_or(false, |arg| self.expression_is_jsx(arg))
            }
            Statement::BlockStatement(block) => {
                // 查找最后一个 return 语句
                for s in block.body.iter().rev() {
                    if let Statement::ReturnStatement(r) = s {
                        if let Some(arg) = &r.argument {
                            return self.expression_is_jsx(arg);
                        }
                    }
                }
                false
            }
            Statement::IfStatement(if_stmt) => {
                // 嵌套的 if 语句
                self.statement_returns_jsx(&if_stmt.consequent)
                    && if_stmt.alternate.as_ref()
                        .map_or(true, |alt| self.statement_returns_jsx(alt))
            }
            _ => false,
        }
    }

    /// 检查表达式是否是 JSX
    fn expression_is_jsx(&self, expr: &Expression<'a>) -> bool {
        matches!(expr, Expression::JSXElement(_) | Expression::JSXFragment(_))
    }

    /// 转换为 ternary 表达式（简化版本）
    fn transform_to_ternary(&mut self, _node: &mut IfStatement<'a>, _ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        // 注意：完整的 AST 替换需要更复杂的实现
        // 这里我们只是标记需要这个转换，让代码生成器处理
        // 实际生产环境中需要使用 oxc_traverse 的 ctx.replace 来进行节点替换

        // 添加注释说明
        self.state.add_helper("/* if-return → ternary conversion pending */");
    }
}

/// 编译函数
pub fn compile(source: &str, options: CompilerOptions) -> Result<String, String> {
    let allocator = Allocator::default();

    // 根据 source_type 确定解析模式
    let source_type_str = options.source_type.as_deref().unwrap_or("jsx");

    // 解析源代码
    let mut program = match crate::parser::parse_with_allocator(&allocator, source, source_type_str) {
        Ok(p) => p,
        Err(e) => return Err(e.message),
    };

    // 创建语义分析（用于生成 scoping）
    let semantic_ret = SemanticBuilder::new()
        .build(&program);

    // 获取 scoping（使用引用的方式）
    let scoping = semantic_ret.semantic.scoping();

    // 创建编译器 Pass
    let mut pass = DomCompilerPass::new(source, options);

    // 使用 oxc_traverse 遍历 AST
    let initial_state = DomCompilerState::new();

    // 创建一个新的 Scoping 用于遍历
    let scopes = oxc_semantic::Scoping::default();
    traverse_mut(&mut pass, &allocator, &mut program, scopes, initial_state);

    // 生成代码 - 使用修改后的 AST 生成代码
    let mut code = String::new();

    // 添加 helpers import（如果需要）
    if !pass.state.used_helpers.is_empty() {
        code.push_str("import { ");
        code.push_str(&pass.state.used_helpers.join(", "));
        code.push_str(" } from \"@zeus-js/core\";\n\n");
    }

    // 添加模板声明
    for template in &pass.state.templates {
        // 转义 HTML 中的特殊字符
        let escaped_html = template.html
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t");
        code.push_str(&format!(
            "const {} = template(\"{}\");\n",
            template.name, escaped_html
        ));
    }

    // 添加委托事件注册
    if !pass.state.delegated_events.is_empty() {
        code.push_str("delegateEvents([");
        for (i, e) in pass.state.delegated_events.iter().enumerate() {
            if i > 0 {
                code.push_str(", ");
            }
            code.push_str(&format!("\"{}\"", e));
        }
        code.push_str("]);\n");
    }

    code.push_str("\n");

    // 使用 oxc_codegen 从修改后的 AST 生成代码
    use oxc_codegen::Codegen;
    let ast_code = Codegen::new().build(&program).code;
    code.push_str(&ast_code);

    Ok(code)
}
