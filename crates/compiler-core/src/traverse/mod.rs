//! AST 遍历模块
//!
//! 这里提供 **最小可用** 的 `oxc_traverse` 集成：
//! - 使用 `oxc_traverse::traverse_mut` 遍历 AST
//! - 在 `enter_jsx_element` 中收集委托事件、标记使用的 runtime helpers
//!
//! 后续在此基础上逐步补齐：JSX → AST 替换、模板抽取、控制流转换等。

use std::cell::RefCell;

pub mod state;
pub mod whitespace;
pub mod control_flow;
pub mod transform;

pub use state::{
    DomCompilerState, TemplateDecl, AttrBinding, AttrBindingKind,
    ChildBinding, StaticNode, ListRender, PendingTransform, TernaryTransform,
    JsxReplacement,
};
pub use whitespace::{cleanup_template_html, normalize_jsx_whitespace};
pub use transform::JsxTransformer;

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_semantic::SemanticBuilder;
use oxc_span::GetSpan;
use oxc_traverse::{traverse_mut, Traverse, TraverseCtx};
use zeus_compiler_common::CompilerOptions;

use self::control_flow::ControlFlowAnalyzer;

/// DOM 编译器 Pass
#[derive(Default)]
#[allow(dead_code)]
pub struct DomCompilerPass<'a> {
    /// 共享状态（使用 RefCell 允许在 traverse 过程中修改）
    shared_state: std::cell::RefCell<DomCompilerState>,
    source: &'a str,
    options: CompilerOptions,
}

impl<'a> DomCompilerPass<'a> {
    /// 创建新的 DOM 编译器 Pass
    pub fn new(source: &'a str, options: CompilerOptions) -> Self {
        Self {
            shared_state: std::cell::RefCell::new(DomCompilerState::new()),
            source,
            options,
        }
    }

    /// 获取共享状态的可变引用（用于在遍历中使用）
    pub fn shared_state(&self) -> &RefCell<DomCompilerState> {
        &self.shared_state
    }

    /// 获取状态
    pub fn state(&self) -> DomCompilerState {
        self.shared_state.borrow().clone()
    }

    /// 检测并优化列表渲染
    fn detect_and_optimize_list_rendering(
        &mut self,
        node: &mut ReturnStatement<'a>,
        _ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) {
        let Some(arg) = node.argument.as_mut() else {
            return;
        };

        let transformer = JsxTransformer::new(self.source);
        let callee_str = transformer.expression_to_source(arg);
        if callee_str.contains(".map(") {
            self.shared_state.borrow_mut().add_helper("renderList");
        }
    }

    /// 将 JSX 元素注册为模板并返回模板调用表达式
    fn make_template_call(
        &mut self,
        jsx: &JSXElement<'a>,
        span: oxc_span::Span,
        ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) -> Expression<'a> {
        let mut transformer = JsxTransformer::new(self.source);
        let (html, child_bindings, attr_bindings) = transformer.jsx_element_to_template_ir(jsx);

        let tmpl_name = self.shared_state.borrow_mut().generate_template_name();
        self.shared_state.borrow_mut().add_helper("template");

        if !child_bindings.is_empty() {
            self.shared_state.borrow_mut().add_helper("insert");
        }

        if attr_bindings.iter().any(|b| matches!(b.kind, AttrBindingKind::Event)) {
            self.shared_state.borrow_mut().add_helper("delegateEvents");
        }

        self.shared_state.borrow_mut().templates.push(TemplateDecl {
            name: tmpl_name.clone(),
            html,
            child_bindings,
            attr_bindings,
            marker_paths: Vec::new(),
            needs_markers: false,
        });

        let tmpl_atom = ctx.ast.allocator.alloc_str(&tmpl_name);
        ctx.ast.expression_call(
            span,
            ctx.ast.expression_identifier(span, tmpl_atom),
            oxc_ast::NONE,
            ctx.ast.vec(),
            false,
        )
    }

    /// 将 JSX Fragment 注册为模板并返回模板调用表达式
    fn make_fragment_template_call(
        &mut self,
        frag: &JSXFragment<'a>,
        span: oxc_span::Span,
        ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) -> Expression<'a> {
        let mut transformer = JsxTransformer::new(self.source);
        let (html, child_bindings) = transformer.jsx_fragment_to_template_ir(frag);

        let tmpl_name = self.shared_state.borrow_mut().generate_template_name();
        self.shared_state.borrow_mut().add_helper("template");

        if !child_bindings.is_empty() {
            self.shared_state.borrow_mut().add_helper("insert");
        }

        self.shared_state.borrow_mut().templates.push(TemplateDecl {
            name: tmpl_name.clone(),
            html,
            child_bindings,
            attr_bindings: Vec::new(),
            marker_paths: Vec::new(),
            needs_markers: false,
        });

        let tmpl_atom = ctx.ast.allocator.alloc_str(&tmpl_name);
        ctx.ast.expression_call(
            span,
            ctx.ast.expression_identifier(span, tmpl_atom),
            oxc_ast::NONE,
            ctx.ast.vec(),
            false,
        )
    }

    /// 创建一个临时的组件调用表达式（当 children 包含 JSX 时使用）
    ///
    /// 这个方法创建一个简单的组件调用，仅包含 props，不包含 children。
    /// children 会被记录在 pending_jsx_replacements 中，由后续的字符串替换处理。
    fn make_fallback_component_call(
        &self,
        component_name: &str,
        span: oxc_span::Span,
        ctx: &TraverseCtx<'a, DomCompilerState>,
    ) -> Expression<'a> {
        let allocator = ctx.ast.allocator;
        let name_atom = allocator.alloc_str(component_name);
        // 创建一个无参数的调用，props 和 children 会在后续字符串替换中添加
        ctx.ast.expression_call(
            span,
            ctx.ast.expression_identifier(span, name_atom),
            oxc_ast::NONE,
            ctx.ast.vec(),
            false,
        )
    }

    /// 将组件 JSX 转换为函数调用表达式
    ///
    /// 例如: `<RouterContext.Provider value={props.router}>{props.children}</RouterContext.Provider>`
    /// 转换为: `RouterContext.Provider({ value: props.router }, props.children)`
    ///
    /// 对于动态标签（如 `<Tag />`），转换为: `DynamicTag(Tag, { href: ..., class: ... }, children)`
    fn make_component_call(
        &mut self,
        jsx: &JSXElement<'a>,
        span: oxc_span::Span,
        ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) -> Expression<'a> {
        let transformer = JsxTransformer::new(self.source);

        // 检测是否为动态标签（如 <Tag />）
        let is_dynamic_tag = self.is_dynamic_tag(&jsx.opening_element.name);

        // 获取组件名称或标签变量名
        let tag_or_component: String;
        if is_dynamic_tag {
            // 动态标签：获取变量名
            tag_or_component = crate::jsx::utils::get_jsx_tag_name(&jsx.opening_element.name);
        } else {
            // 组件：获取组件名称
            tag_or_component = crate::jsx::utils::get_jsx_tag_name(&jsx.opening_element.name);
        }
        eprintln!("DEBUG make_component_call: tag_or_component = {}, is_dynamic_tag = {}", tag_or_component, is_dynamic_tag);

        // 检查是否为组件（大写开头或包含点号）
        let is_component_name = tag_or_component.starts_with(|c: char| c.is_uppercase())
            || tag_or_component.contains('.');

        // 对于大写开头的组件，即使 is_dynamic_tag 为 true，也应该直接调用组件函数
        // 只有小写开头的非 HTML 标签才需要 DynamicTag
        let force_component_call = is_component_name && is_dynamic_tag;
        eprintln!("DEBUG make_component_call: is_component_name = {}, force_component_call = {}", is_component_name, force_component_call);

        // 收集 props
        let mut props = Vec::new();
        for attr in &jsx.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                // 获取属性名
                let name = match &attr.name {
                    JSXAttributeName::Identifier(id) => id.name.to_string(),
                    _ => continue,
                };
                // 获取属性值
                let value = match &attr.value {
                    Some(JSXAttributeValue::ExpressionContainer(expr)) => {
                        if let Some(inner_expr) = expr.expression.as_expression() {
                            transformer.expression_to_source(inner_expr)
                        } else {
                            "undefined".to_string()
                        }
                    }
                    Some(JSXAttributeValue::StringLiteral(s)) => format!("\"{}\"", s.value),
                    None => "true".to_string(),
                    _ => "{}".to_string(),
                };
                props.push(format!("{}: {}", name, value));
            }
        }

        // 构建调用表达式
        let props_str = if props.is_empty() {
            "{}".to_string()
        } else {
            format!("{{{}}}", props.join(", "))
        };

        // 获取 children 区域：opening_element 结束位置到 closing_element 开始位置
        let opening_end = jsx.opening_element.span.end;
        let closing_start = jsx.closing_element.as_ref().map(|c| c.span.start).unwrap_or(span.end);
        let children_raw = if closing_start > opening_end {
            transformer.source()[opening_end as usize..closing_start as usize].to_string()
        } else {
            String::new()
        };

        // 检查 children 是否包含 JSX 元素
        let children_has_jsx = children_raw.trim().starts_with('<');

        // 清理 children：移除大括号，只保留表达式内容
        // `{props.children}` -> `props.children`
        // `{foo}{bar}` -> `foo, bar`
        let children_str = clean_jsx_children_for_call(&children_raw);

        // 根据是否为动态标签生成不同的调用表达式
        // 注意：大写开头的组件即使被识别为 is_dynamic_tag，也应该直接调用
        let full_call = if is_dynamic_tag && !force_component_call {
            // 动态标签：使用 DynamicTag(tag, props, children)
            // 例如: DynamicTag(Tag, { href: toPath(), class: className() }, props.children)
            if children_str.is_empty() && !children_has_jsx {
                format!("DynamicTag({}, {})", tag_or_component, props_str)
            } else if children_has_jsx {
                // children 包含 JSX，需要特殊处理
                // 由于 JSX 无法直接在字符串参数中解析，我们需要标记这个组件需要后续处理
                // 在这种情况下，返回一个标记让外部知道需要处理
                eprintln!("DEBUG make_component_call: children has JSX, marking for later processing");
                self.shared_state.borrow_mut().pending_jsx_replacements.push(JsxReplacement {
                    span: jsx.span,
                    is_component: true,
                    is_dynamic_tag: false,  // 因为是组件，不使用 DynamicTag
                    component_name: Some(tag_or_component.clone()),
                    props_source: Some(props_str.clone()),
                    children_source: Some(children_raw.clone()),
                });
                // 返回一个占位符
                return self.make_fallback_component_call(&tag_or_component, jsx.span, ctx);
            } else {
                format!("DynamicTag({}, {}, {})", tag_or_component, props_str, children_str)
            }
        } else {
            // 组件：直接调用组件函数
            // 例如: RouterContext.Provider({ value: props.router }, props.children)
            if children_str.is_empty() && !children_has_jsx {
                format!("{}({})", tag_or_component, props_str)
            } else if children_has_jsx {
                // children 包含 JSX，需要特殊处理
                eprintln!("DEBUG make_component_call: children has JSX, marking for later processing");
                self.shared_state.borrow_mut().pending_jsx_replacements.push(JsxReplacement {
                    span: jsx.span,
                    is_component: true,
                    is_dynamic_tag: false,
                    component_name: Some(tag_or_component.clone()),
                    props_source: Some(props_str.clone()),
                    children_source: Some(children_raw.clone()),
                });
                // 返回一个占位符
                return self.make_fallback_component_call(&tag_or_component, jsx.span, ctx);
            } else {
                format!("{}({}, {})", tag_or_component, props_str, children_str)
            }
        };

        eprintln!("DEBUG make_component_call: generated = {}", full_call);

        // 动态标签需要注册 DynamicTag helper（但大写开头的组件不需要）
        if is_dynamic_tag && !force_component_call {
            self.shared_state.borrow_mut().add_helper("DynamicTag");
        }

        // 如果 children 包含 JSX，需要注册 Fragment helper
        if children_has_jsx {
            self.shared_state.borrow_mut().add_helper("Fragment");
        }

        // 开始处理 JSX span，用于在 exit_jsx_element 中检查
        self.shared_state.borrow_mut().start_processing_jsx(jsx.span);

        // 解析生成的代码为 AST
        let allocator = ctx.ast.allocator;

        // 解析生成的代码
        match crate::parser::parse_with_allocator(allocator, &full_call, "jsx") {
            Ok(parsed) => {
                // 从解析的结果中提取 Expression
                if let Some(stmt) = parsed.body.first() {
                    if let Statement::ExpressionStatement(expr_stmt) = stmt {
                        use oxc_allocator::CloneIn;
                        return expr_stmt.expression.clone_in(allocator);
                    }
                }
            }
            Err(e) => {
                eprintln!("DEBUG make_component_call: parse error: {}", e.message);
            }
        }

        // 如果解析失败，创建一个简单的调用表达式
        // 使用 ast builder 创建
        let name_atom = allocator.alloc_str(&tag_or_component);
        ctx.ast.expression_call(
            span,
            ctx.ast.expression_identifier(span, name_atom),
            oxc_ast::NONE,
            ctx.ast.vec(),
            false,
        )
    }

    /// 检测 JSX 标签是否为动态标签（标识符引用）
    ///
    /// 例如 `<Tag />` 中的 Tag 是变量引用，不是静态标签
    fn is_dynamic_tag(&self, name: &JSXElementName) -> bool {
        matches!(name, JSXElementName::IdentifierReference(_))
    }

    /// 检查 JSX 标签是否为组件形式
    ///
    /// 组件形式的标签名包含 `.`，如 `RouterContext.Provider`
    /// 或者首字母大写的标识符，如 `RouterLink`
    /// 或者标识符引用（如变量 Tag），需要动态处理
    fn is_component_jsx(&self, name: &JSXElementName) -> bool {
        match name {
            JSXElementName::MemberExpression(_) => true,
            JSXElementName::Identifier(id) => {
                // 首字母大写的标识符也是组件
                let first_char = id.name.as_str().chars().next();
                first_char.map(|c| c.is_uppercase()).unwrap_or(false)
            }
            JSXElementName::IdentifierReference(_) => {
                // 标识符引用（如变量 Tag）需要动态处理，视为组件
                // 这是动态标签的情况，如 <Tag href="...">content</Tag>
                true
            }
            _ => false,
        }
    }
}

impl<'a> Traverse<'a, DomCompilerState> for DomCompilerPass<'a> {
    fn enter_return_statement(
        &mut self,
        node: &mut ReturnStatement<'a>,
        ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) {
        self.detect_and_optimize_list_rendering(node, ctx);

        let Some(arg) = node.argument.as_mut() else {
            return;
        };

        let span = arg.span();

        // 检查是否是列表渲染 (.map() 调用)
        let is_list_rendering = if let Expression::CallExpression(call) = arg {
            let transformer = JsxTransformer::new(self.source);
            let callee_str = transformer.expression_to_source(&call.callee);
            callee_str.contains(".map") || callee_str.contains("map(")
        } else {
            false
        };

        if is_list_rendering {
            self.shared_state.borrow_mut().add_helper("template");
            self.shared_state.borrow_mut().add_helper("renderList");
            let item_tmpl_name = self.shared_state.borrow_mut().generate_template_name();
            self.shared_state.borrow_mut().templates.push(TemplateDecl {
                name: item_tmpl_name,
                html: "<!---->".to_string(),
                child_bindings: Vec::new(),
                attr_bindings: Vec::new(),
                marker_paths: Vec::new(),
                needs_markers: false,
            });
        }

        match arg {
            Expression::JSXElement(jsx) => {
                eprintln!("DEBUG enter_return: Processing direct JSXElement");
                eprintln!("DEBUG enter_return: jsx.opening_element.name type = {:?}", jsx.opening_element.name);
                // 检查是否是组件形式的 JSX（如 RouterContext.Provider）
                let is_component = self.is_component_jsx(&jsx.opening_element.name);
                eprintln!("DEBUG enter_return: is_component = {}", is_component);
                if is_component {
                    eprintln!("DEBUG enter_return: Converting component JSX to call expression");
                    // 直接将组件 JSX 转换为函数调用表达式
                    let call_expr = self.make_component_call(jsx, span, ctx);
                    *arg = call_expr;
                    return;
                }
                let call_expr = self.make_template_call(jsx, span, ctx);
                *arg = call_expr;
            }
            Expression::JSXFragment(frag) => {
                let call_expr = self.make_fragment_template_call(frag, span, ctx);
                *arg = call_expr;
            }
            Expression::CallExpression(call) => {
                // 检查是否是 .map() 调用
                let transformer = JsxTransformer::new(self.source);
                let callee_str = transformer.expression_to_source(&call.callee);
                let is_map_call = callee_str.contains(".map") || callee_str.contains("map(");

                if is_map_call {
                    // 处理 .map() 等调用表达式中的箭头函数内的 JSX
                    for arg_item in &mut call.arguments {
                        if let Some(expr) = arg_item.as_expression_mut() {
                            if let Expression::ArrowFunctionExpression(arrow) = expr {
                                if !arrow.expression {
                                    continue;
                                }
                                let stmts = &mut arrow.body.statements;
                                if stmts.len() != 1 {
                                    continue;
                                }
                                let stmt = &mut stmts[0];
                                let Statement::ReturnStatement(ret) = stmt else {
                                    continue;
                                };
                                let Some(ret_arg) = ret.argument.as_mut() else {
                                    continue;
                                };
                                if let Expression::JSXElement(inner_jsx) = ret_arg {
                                    // 跳过组件形式的 JSX
                                    if self.is_component_jsx(&inner_jsx.opening_element.name) {
                                        continue;
                                    }
                                    let call_expr = self.make_template_call(inner_jsx, inner_jsx.span, ctx);
                                    *ret_arg = call_expr;
                                }
                            }
                        }
                    }
                } else {
                    // 检查 CallExpression 中是否有 JSX 子节点（如 <Provider><Child /></Provider>）
                    // 需要处理 children
                    let has_jsx_children = call.arguments.iter().any(|arg| {
                        if let Some(expr) = arg.as_expression() {
                            matches!(expr, Expression::JSXElement(_) | Expression::JSXFragment(_))
                        } else {
                            false
                        }
                    });

                    if has_jsx_children {
                        // 对于包含 JSX 的组件调用，需要特殊处理
                        // 遍历所有参数，检查是否有 JSX
                        for arg_item in &mut call.arguments {
                            if let Some(expr) = arg_item.as_expression_mut() {
                                match expr {
                                    Expression::JSXElement(inner_jsx) => {
                                        // 跳过组件形式的 JSX（如 RouterContext.Provider）
                                        if !self.is_component_jsx(&inner_jsx.opening_element.name) {
                                            let call_expr = self.make_template_call(inner_jsx, inner_jsx.span, ctx);
                                            *expr = call_expr;
                                        }
                                    }
                                    Expression::JSXFragment(inner_frag) => {
                                        let call_expr = self.make_fragment_template_call(inner_frag, inner_frag.span, ctx);
                                        *expr = call_expr;
                                    }
                                    _ => {}
                                }
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }

    /// 处理箭头函数表达式体中的 JSX
    ///
    /// 箭头函数表达式体（如 `const Foo = () => <div />`）oxc 内部表示为
    /// FunctionBody 中包含一个隐式的 ReturnStatement（expression=true 标记）。
    fn enter_arrow_function_expression(
        &mut self,
        node: &mut ArrowFunctionExpression<'a>,
        ctx: &mut TraverseCtx<'a, DomCompilerState>,
    ) {
        // 只处理表达式体箭头函数
        if !node.expression {
            return;
        }

        let stmts = &mut node.body.statements;
        if stmts.len() != 1 {
            return;
        }

        let stmt = &mut stmts[0];
        let Statement::ReturnStatement(ret) = stmt else {
            return;
        };

        let Some(ret_arg) = ret.argument.as_mut() else {
            return;
        };

        let span = ret_arg.span();

        match ret_arg {
            Expression::JSXElement(inner_jsx) => {
                eprintln!("DEBUG enter_arrow: Processing direct JSXElement");
                // 跳过组件形式的 JSX（如 RouterContext.Provider）
                if self.is_component_jsx(&inner_jsx.opening_element.name) {
                    eprintln!("DEBUG enter_arrow: Skipping component JSX");
                    return;
                }
                let call_expr = self.make_template_call(inner_jsx, span, ctx);
                *ret_arg = call_expr;
            }
            Expression::JSXFragment(inner_frag) => {
                let call_expr = self.make_fragment_template_call(inner_frag, span, ctx);
                *ret_arg = call_expr;
            }
            _ => {}
        }
    }

    fn enter_if_statement(&mut self, node: &mut IfStatement<'a>, _ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        let mut analyzer = ControlFlowAnalyzer::new(self.source);
        if analyzer.should_transform_to_ternary(node) {
            if let Some(transform) = analyzer.transform_to_ternary(node, &mut self.shared_state.borrow_mut()) {
                self.shared_state.borrow_mut().ternary_transforms.push(transform);
            }
        }
    }

    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, _ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        self.shared_state.borrow_mut().in_jsx = true;
        self.shared_state.borrow_mut().depth += 1;

        for item in &node.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = item {
                if let JSXAttributeName::Identifier(id) = &attr.name {
                    let name = id.name.as_str();
                    if name.starts_with("on") && name.len() > 2 {
                        let event = name[2..].to_lowercase();
                        self.shared_state.borrow_mut().add_delegated_event(&event);
                    }
                }
            }
        }
    }

    fn exit_jsx_element(&mut self, node: &mut JSXElement<'a>, _ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        self.shared_state.borrow_mut().depth -= 1;

        // 检查是否是组件形式（包含 . 的标签名，如 RouterContext.Provider）
        // 注意：组件 JSX 在 enter_return_statement 中已经处理过了，不需要在这里处理
        if self.is_component_jsx(&node.opening_element.name) {
            eprintln!("DEBUG exit_jsx_element: Skipping component JSX span={}..{} (already handled in enter_return)",
                node.span.start, node.span.end);
            return;
        }

        eprintln!("DEBUG exit_jsx_element: Processing non-component JSX");

        let mut transformer = JsxTransformer::new(self.source);
        let (element_html, child_bindings, attr_bindings) = transformer.jsx_element_to_template_ir(node);

        // 获取嵌套模板
        let nested_templates = transformer.take_nested_templates();
        for nested_tmpl in nested_templates {
            self.shared_state.borrow_mut().templates.push(nested_tmpl);
        }

        if child_bindings.is_empty() && attr_bindings.is_empty() {
            return;
        }

        let tmpl_name = self.shared_state.borrow_mut().generate_template_name();
        self.shared_state.borrow_mut().add_helper("template");

        if !child_bindings.is_empty() {
            self.shared_state.borrow_mut().add_helper("insert");
        }

        if attr_bindings.iter().any(|b| matches!(b.kind, AttrBindingKind::Event)) {
            self.shared_state.borrow_mut().add_helper("delegateEvents");
        }

        self.shared_state.borrow_mut().templates.push(TemplateDecl {
            name: tmpl_name.clone(),
            html: element_html,
            child_bindings,
            attr_bindings,
            marker_paths: Vec::new(),
            needs_markers: false,
        });

        // 注意：由于 oxc_traverse 的限制，我们无法直接替换当前节点
        // 替代方案：在 return 语句等入口点进行替换
    }
}

/// 编译函数
pub fn compile(source: &str, options: CompilerOptions) -> Result<String, String> {
    let source_type_str = options.source_type.as_deref().unwrap_or("jsx").to_string();

    eprintln!("DEBUG compile: source_type = {}", source_type_str);
    eprintln!("DEBUG compile: first 100 chars = {}", &source[..source.len().min(100)]);

    let allocator = Allocator::default();

    let mut program = match crate::parser::parse_with_allocator(&allocator, source, &source_type_str) {
        Ok(p) => p,
        Err(e) => return Err(e.message),
    };

    let semantic_ret = SemanticBuilder::new()
        .build(&program);

    // 从 semantic_ret 中提取 scoping 的所有权
    let scoping = semantic_ret.semantic.into_scoping();

    let mut pass = DomCompilerPass::new(source, options);

    // 创建初始状态
    let initial_state = DomCompilerState::new();

    // 记录遍历前的状态
    eprintln!("DEBUG compile: before traverse, shared_state has {} pending_jsx_replacements",
        pass.shared_state.borrow().pending_jsx_replacements.len());

    // 使用 traverse_mut 遍历 AST
    let _final_scoping = oxc_traverse::traverse_mut(&mut pass, &allocator, &mut program, scoping, initial_state);

    // 检查遍历后 shared_state 中的数据
    eprintln!("DEBUG compile: after traverse, shared_state has {} pending_jsx_replacements",
        pass.shared_state.borrow().pending_jsx_replacements.len());
    eprintln!("DEBUG compile: after traverse, shared_state has {} used_helpers",
        pass.shared_state.borrow().used_helpers.len());
    eprintln!("DEBUG compile: after traverse, shared_state used_helpers = {:?}",
        pass.shared_state.borrow().used_helpers);

    // 从 shared_state 中获取收集的状态
    let traversed_state = pass.state();
    eprintln!("DEBUG compile: traversed_state.pending_jsx_replacements.len() = {}", traversed_state.pending_jsx_replacements.len());

    // 生成代码
    let generated_code = generate_compiled_code(&traversed_state, &allocator, &program, source);

    Ok(generated_code)
}

/// 生成编译后的代码
fn generate_compiled_code(state: &DomCompilerState, _allocator: &Allocator, program: &Program, source: &str) -> String {
    let mut code = String::new();

    eprintln!("DEBUG generate_compiled_code: state.templates.len() = {}", state.templates.len());
    eprintln!("DEBUG generate_compiled_code: state.pending_jsx_replacements.len() = {}", state.pending_jsx_replacements.len());
    eprintln!("DEBUG generate_compiled_code: state.used_helpers.len() = {}", state.used_helpers.len());

    // 1. 生成 import 语句
    if !state.used_helpers.is_empty() {
        code.push_str("import { ");
        code.push_str(&state.used_helpers.join(", "));
        code.push_str(" } from \"@zeus-js/core\";\n\n");
    }

    // 2. 生成模板声明（只在模块顶层）
    for template in &state.templates {
        let cleaned_html = crate::traverse::whitespace::cleanup_template_html(&template.html);

        let escaped_html = cleaned_html
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r")
            .replace('\t', "\\t");

        // 模板是纯静态 HTML，不需要 marker
        code.push_str(&format!(
            "var {} = template(\"{}\");\n",
            template.name, escaped_html
        ));
    }

    // 3. 生成事件委托（如果在模块顶层有事件）
    if !state.delegated_events.is_empty() {
        code.push_str("delegateEvents([");
        for (i, e) in state.delegated_events.iter().enumerate() {
            if i > 0 {
                code.push_str(", ");
            }
            code.push_str(&format!("\"{}\"", e));
        }
        code.push_str("]);\n");
    }

    code.push('\n');

    // 4. 使用 oxc_codegen 生成用户代码
    use oxc_codegen::Codegen;
    let ast_code = Codegen::new().build(&program).code;

    // 5. 处理组件 JSX 的字符串替换
    let replaced_code = convert_component_jsx_in_code(&ast_code, source, state);

    // 6. 合并：检查是否需要添加缺失的 helpers
    // 由于 convert_component_jsx_in_code 可能添加了 DynamicTag 等 helpers，
    // 需要检查并在开头添加 import
    let final_code = if !state.used_helpers.is_empty() {
        // 检查 replaced_code 是否已经有 import 语句
        if replaced_code.starts_with("import ") {
            // 替换 import 语句中的 helpers
            if replaced_code.contains("from \"@zeus-js/core\"") {
                // 简单方案：在 import 后添加缺失的 helpers
                // 更完善的方案是解析 import 语句，但这里我们用字符串处理
                let mut has_dynamic_tag = false;
                for (i, r) in state.pending_jsx_replacements.iter().enumerate() {
                    if r.is_dynamic_tag {
                        has_dynamic_tag = true;
                        break;
                    }
                }
                if has_dynamic_tag && !replaced_code.contains("DynamicTag") {
                    // 在 import 中添加 DynamicTag
                    replaced_code.replacen("} from \"@zeus-js/core\"", "DynamicTag, } from \"@zeus-js/core\"", 1)
                } else {
                    replaced_code
                }
            } else {
                replaced_code
            }
        } else {
            // 在开头添加 import 语句
            format!("import {{ {} }} from \"@zeus-js/core\";\n\n{}",
                state.used_helpers.join(", "), replaced_code)
        }
    } else {
        replaced_code
    };

    final_code
}

/// 将组件 JSX 转换为 JavaScript 调用形式
///
/// 策略：使用原始 span 位置直接在生成的代码中进行字符串替换。
/// 由于 oxc_codegen 会保留原始的 span 信息，替换位置是准确的。
fn convert_component_jsx_in_code(ast_code: &str, source: &str, state: &DomCompilerState) -> String {
    // 如果没有需要替换的组件 JSX，直接返回
    if state.pending_jsx_replacements.is_empty() {
        eprintln!("DEBUG convert_component_jsx: no replacements needed");
        return ast_code.to_string();
    }

    // 调试：打印替换信息
    eprintln!("DEBUG convert_component_jsx: {} replacements pending", state.pending_jsx_replacements.len());
    eprintln!("DEBUG convert_component_jsx: ast_code length = {}, source length = {}", ast_code.len(), source.len());

    // 打印 pending_jsx_replacements 的详细信息
    for (i, r) in state.pending_jsx_replacements.iter().enumerate() {
        eprintln!("DEBUG convert_component_jsx: replacement[{}] span={}..{}, is_component={}",
            i, r.span.start, r.span.end, r.is_component);
    }

    // 按位置从后往前替换（避免偏移量问题）
    let mut sorted_replacements: Vec<_> = state.pending_jsx_replacements.iter()
        .filter(|r| r.is_component)
        .map(|r| (r.span.start as usize, r.span.end as usize, r.is_dynamic_tag))
        .collect();
    sorted_replacements.sort_by_key(|&(start, _, _)| std::cmp::Reverse(start));

    let mut result = ast_code.to_string();
    eprintln!("DEBUG convert_component_jsx: result length after copy = {}", result.len());

    for (i, &(start, end, is_dynamic_tag)) in sorted_replacements.iter().enumerate() {
        // 使用原始 source 的 span 位置
        eprintln!("DEBUG convert_component_jsx: processing replacement[{}] start={}, end={}, is_dynamic_tag={}, result.len={}", i, start, end, is_dynamic_tag, result.len());

        if start >= result.len() || end > result.len() || start >= end {
            eprintln!("DEBUG convert_component_jsx: skipped due to invalid range");
            continue;
        }

        let jsx_source = &result[start..end];
        eprintln!("DEBUG convert_component_jsx: jsx_source = {:?}", jsx_source);

        // 解析 JSX 并转换为调用表达式
        // 使用 is_dynamic_tag 作为 force_dynamic_tag
        if let Some(converted) = convert_single_jsx_to_call(jsx_source, is_dynamic_tag) {
            eprintln!("DEBUG convert_component_jsx: converted = {}", converted);
            result.replace_range(start..end, &converted);
        } else {
            eprintln!("DEBUG convert_component_jsx: convert_single_jsx_to_call returned None");
        }
    }

    result
}

/// 在文本中查找 JSX 片段（用于备用替换策略）
fn find_jsx_in_text(text: &str, jsx_source: &str) -> Option<usize> {
    let trimmed = jsx_source.trim();
    let tag_name = extract_tag_name(trimmed)?;

    // 在 text 中查找包含相同标签名的 JSX
    let search_start = format!("<{}", tag_name);
    let mut search_pos = 0;

    while let Some(pos) = text[search_pos..].find(&search_start) {
        let actual_pos = search_pos + pos;
        // 检查这是否是我们要找的 JSX
        if let Some(end_pos) = find_jsx_end(&text[actual_pos..]) {
            let full_end = actual_pos + end_pos;
            let candidate = text[actual_pos..full_end].trim();
            // 比较 JSX 内容
            if candidates_match(trimmed, candidate) {
                return Some(actual_pos);
            }
        }
        search_pos = actual_pos + 1;
    }

    None
}

/// 提取 JSX 的标签名
fn extract_tag_name(jsx: &str) -> Option<String> {
    let trimmed = jsx.trim();
    if !trimmed.starts_with('<') {
        return None;
    }

    let chars: Vec<char> = trimmed.chars().collect();
    let mut tag_end = 1;

    for i in 1..chars.len() {
        let c = chars[i];
        if c == ' ' || c == '>' || c == '/' {
            tag_end = i;
            break;
        }
    }

    Some(trimmed[1..tag_end].to_string())
}

/// 比较两个 JSX 候选是否匹配
fn candidates_match(original: &str, candidate: &str) -> bool {
    let orig_trimmed = original.trim();
    let cand_trimmed = candidate.trim();

    // 提取标签名进行比较
    if let (Some(orig_tag), Some(cand_tag)) = (extract_tag_name(orig_trimmed), extract_tag_name(cand_trimmed)) {
        if orig_tag != cand_tag {
            return false;
        }

        // 提取属性字符串进行比较（从标签名后到 > 之前）
        let orig_attrs = extract_tag_attrs(orig_trimmed);
        let cand_attrs = extract_tag_attrs(cand_trimmed);

        if orig_attrs != cand_attrs {
            return false;
        }

        return true;
    }

    false
}

/// 提取 JSX 标签属性部分（从标签名后到第一个 > 之前）
fn extract_tag_attrs(jsx: &str) -> Option<String> {
    let trimmed = jsx.trim();
    let chars: Vec<char> = trimmed.chars().collect();

    // 跳过 < 符号
    let mut pos = 1;

    // 跳过标签名
    while pos < chars.len() {
        let c = chars[pos];
        if c == ' ' || c == '>' || c == '/' {
            break;
        }
        pos += 1;
    }

    // 收集属性部分
    let mut attrs = String::new();
    while pos < chars.len() {
        let c = chars[pos];
        if c == '>' {
            return Some(attrs.trim().to_string());
        }
        if c == '/' && pos + 1 < chars.len() && chars[pos + 1] == '>' {
            return Some(attrs.trim().to_string());
        }
        attrs.push(c);
        pos += 1;
    }

    None
}

/// 查找 JSX 的结束位置
fn find_jsx_end(text: &str) -> Option<usize> {
    let mut depth = 0;
    let mut in_tag = false;
    let mut in_string = false;
    let mut string_char = ' ';
    let chars: Vec<char> = text.chars().collect();

    for (i, c) in chars.iter().enumerate() {
        if !in_string {
            if *c == '<' && !in_tag {
                in_tag = true;
                depth = 1;
            } else if *c == '>' && in_tag {
                in_tag = false;
                return Some(i + 1);
            } else if *c == '<' {
                depth += 1;
            } else if *c == '/' && i + 1 < chars.len() && chars[i + 1] == '>' {
                depth -= 1;
                if depth == 0 {
                    return Some(i + 2);
                }
            }
        } else {
            if *c == '"' || *c == '\'' {
                if !in_string {
                    in_string = true;
                    string_char = *c;
                } else if *c == string_char {
                    in_string = false;
                }
            }
        }
    }
    None
}

/// 将单个 JSX 元素转换为调用表达式
/// `force_dynamic_tag` - 如果为 true，则强制将标签视为动态标签
fn convert_single_jsx_to_call(jsx_source: &str, force_dynamic_tag: bool) -> Option<String> {
    let trimmed = jsx_source.trim();
    if !trimmed.starts_with('<') {
        return None;
    }

    // 提取标签名和属性
    let (tag_name, attrs_str, children) = parse_jsx_element(trimmed)?;

    // 检测是否为动态标签（小写开头的标识符，不是 HTML 标签）
    // 或者被强制标记为动态标签
    let is_dynamic_tag = force_dynamic_tag || is_dynamic_jsx_tag(&tag_name);

    // 检查是否为组件（大写开头或包含点号）
    let is_component_name = tag_name.starts_with(|c: char| c.is_uppercase())
        || tag_name.contains('.');

    // 对于大写开头的组件，即使 force_dynamic_tag 为 true，也不应该使用 DynamicTag
    let should_use_dynamic_tag = is_dynamic_tag && !is_component_name;

    // 检查 children 是否包含 JSX 元素
    let children_has_jsx = children.trim().starts_with('<');

    eprintln!("DEBUG convert_single_jsx_to_call: tag_name={}, is_dynamic_tag={} (force={}), is_component_name={}, should_use_dynamic_tag={}, children_has_jsx={}",
        tag_name, is_dynamic_tag, force_dynamic_tag, is_component_name, should_use_dynamic_tag, children_has_jsx);
    eprintln!("DEBUG convert_single_jsx_to_call: attrs_str={:?}, children={:?}", attrs_str, children);

    // 构建 props 对象
    let props = parse_jsx_props(attrs_str);

    // 构建调用表达式
    if should_use_dynamic_tag {
        // 动态标签：使用 DynamicTag(tag, props, children)
        let mut args: Vec<String> = Vec::new();
        // 第一个参数是标签名本身（变量引用）
        args.push(tag_name.clone());

        // 第二个参数是 props
        if !props.is_empty() {
            args.push(format!("{{{}}}", props.join(", ")));
        } else {
            args.push("{}".to_string());
        }

        // 第三个参数是 children
        if !children.is_empty() {
            if children_has_jsx {
                // children 包含 JSX，需要递归处理或使用特殊格式
                // 这里我们递归调用 convert_single_jsx_to_call 来处理嵌套 JSX
                let processed_children = convert_jsx_children_to_calls(children);
                if !processed_children.is_empty() {
                    args.push(format!("[{}]", processed_children.join(", ")));
                }
            } else {
                let trimmed_children = clean_jsx_children_for_call(children.trim());
                if !trimmed_children.is_empty() {
                    args.push(trimmed_children);
                }
            }
        }

        Some(format!("DynamicTag({})", args.join(", ")))
    } else {
        // 普通组件调用：直接调用组件函数
        let mut args: Vec<String> = Vec::new();
        if !props.is_empty() {
            args.push(format!("{{{}}}", props.join(", ")));
        } else if !children.is_empty() {
            args.push("null".to_string());  // 如果没有 props 但有 children，需要传 null 占位
        }

        // 添加 children
        if !children.is_empty() {
            if children_has_jsx {
                // children 包含 JSX，需要递归处理
                let processed_children = convert_jsx_children_to_calls(children);
                if !processed_children.is_empty() {
                    args.push(format!("[{}]", processed_children.join(", ")));
                }
            } else {
                let trimmed_children = clean_jsx_children_for_call(children.trim());
                if !trimmed_children.is_empty() {
                    args.push(trimmed_children);
                }
            }
        }

        Some(format!("{}({})", tag_name, args.join(", ")))
    }
}

/// 递归处理 JSX children，将其转换为函数调用表达式数组
fn convert_jsx_children_to_calls(children: &str) -> Vec<String> {
    let mut results = Vec::new();
    let trimmed = children.trim();

    if trimmed.is_empty() {
        return results;
    }

    // 使用栈来解析嵌套的 JSX
    let mut chars: Vec<char> = trimmed.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        if c == '<' && !is_in_string(&chars, i) {
            // 开始一个 JSX 元素
            let (element, end_pos) = extract_jsx_element(&chars, i);
            if let Some((tag_name, attrs_str, element_children)) = parse_jsx_element(&element) {
                // 检查是否为组件
                let is_component = tag_name.starts_with(|ch: char| ch.is_uppercase())
                    || tag_name.contains('.');

                if is_component {
                    // 组件调用
                    let props = parse_jsx_props(attrs_str);
                    let mut args = Vec::new();

                    if !props.is_empty() {
                        args.push(format!("{{{}}}", props.join(", ")));
                    }

                    // 递归处理 children
                    if !element_children.is_empty() {
                        let child_calls = convert_jsx_children_to_calls(element_children);
                        if !child_calls.is_empty() {
                            args.push(format!("[{}]", child_calls.join(", ")));
                        }
                    }

                    results.push(format!("{}({})", tag_name, args.join(", ")));
                } else {
                    // HTML 元素，递归处理
                    let child_calls = convert_jsx_children_to_calls(element_children);
                    if !child_calls.is_empty() {
                        results.push(format!("[{}]", child_calls.join(", ")));
                    }
                }
            }

            i = end_pos;
        } else if c == '>' || c == '/' || c == '=' || c.is_whitespace() {
            // 跳过空白
            i += 1;
        } else {
            // 文本内容
            let mut text = String::new();
            while i < chars.len() {
                let ch = chars[i];
                if ch == '<' && !is_in_string(&chars, i) {
                    break;
                }
                text.push(ch);
                i += 1;
            }
            let trimmed_text = text.trim();
            if !trimmed_text.is_empty() {
                results.push(format!("\"{}\"", trimmed_text));
            }
        }
    }

    results
}

/// 检查指定位置是否在字符串内
fn is_in_string(chars: &[char], pos: usize) -> bool {
    let mut in_string = false;
    let mut string_char = ' ';
    let mut escaped = false;

    for i in 0..pos {
        let c = chars[i];
        if escaped {
            escaped = false;
            continue;
        }
        if c == '\\' {
            escaped = true;
            continue;
        }
        if in_string {
            if c == string_char {
                in_string = false;
            }
        } else if c == '"' || c == '\'' {
            in_string = true;
            string_char = c;
        }
    }
    in_string
}

/// 从给定位置提取完整的 JSX 元素
fn extract_jsx_element(chars: &[char], start: usize) -> (String, usize) {
    if start >= chars.len() || chars[start] != '<' {
        return (String::new(), start);
    }

    let mut depth = 0;
    let mut in_tag = false;
    let mut in_string = false;
    let mut string_char = ' ';
    let mut escaped = false;
    let mut i = start;

    while i < chars.len() {
        let c = chars[i];

        if escaped {
            escaped = false;
            i += 1;
            continue;
        }

        if c == '\\' && in_string {
            escaped = true;
            i += 1;
            continue;
        }

        if in_string {
            if c == string_char {
                in_string = false;
            }
            i += 1;
            continue;
        }

        match c {
            '"' | '\'' => {
                in_string = true;
                string_char = c;
                i += 1;
            }
            '<' => {
                if !in_tag {
                    in_tag = true;
                    depth = 1;
                } else {
                    depth += 1;
                }
                i += 1;
            }
            '>' => {
                if in_tag {
                    depth -= 1;
                    if depth == 0 {
                        return (chars[start..=i].iter().collect(), i + 1);
                    }
                }
                i += 1;
            }
            _ => {
                i += 1;
            }
        }
    }

    (chars[start..i].iter().collect(), i)
}

/// 检测是否为动态 JSX 标签
///
/// 动态标签的特征：
/// - 小写开头的标识符，但不是已知的 HTML 标签
/// - 这种情况通常是变量引用，如 <Tag />
fn is_dynamic_jsx_tag(tag_name: &str) -> bool {
    // 如果是已知的小写 HTML 标签，不是动态标签
    let known_html_tags = [
        "a", "abbr", "address", "area", "article", "aside", "audio", "b", "base",
        "bdi", "bdo", "blockquote", "body", "br", "button", "canvas", "caption",
        "cite", "code", "col", "colgroup", "data", "datalist", "dd", "del",
        "details", "dfn", "dialog", "div", "dl", "dt", "em", "embed", "fieldset",
        "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5",
        "h6", "head", "header", "hgroup", "hr", "html", "i", "iframe", "img",
        "input", "ins", "kbd", "label", "legend", "li", "link", "main", "map",
        "mark", "math", "menu", "meta", "meter", "nav", "noscript", "object",
        "ol", "optgroup", "option", "output", "p", "param", "picture", "pre",
        "progress", "q", "rp", "rt", "ruby", "s", "samp", "script", "search",
        "section", "select", "slot", "small", "source", "span", "strong", "style",
        "sub", "sup", "table", "tbody", "td", "template", "textarea", "tfoot",
        "th", "thead", "time", "title", "tr", "track", "u", "ul", "var", "video",
        "wbr", "path", "circle", "rect", "line", "polyline", "polygon", "g",
    ];

    // 小写开头且不是已知 HTML 标签，则认为是动态标签
    if let Some(first_char) = tag_name.chars().next() {
        if first_char.is_lowercase() {
            return !known_html_tags.contains(&tag_name);
        }
    }

    false
}

/// 解析 JSX 元素
fn parse_jsx_element(jsx: &str) -> Option<(String, &str, &str)> {
    let trimmed = jsx.trim();
    if !trimmed.starts_with('<') {
        return None;
    }

    // 找到标签名结束的位置
    let mut tag_end = 1;
    let chars: Vec<char> = trimmed.chars().collect();

    // 跳过 < 符号
    for i in 1..chars.len() {
        let c = chars[i];
        if c == ' ' || c == '>' || c == '/' {
            tag_end = i;
            break;
        }
    }

    let tag_name = &trimmed[1..tag_end];

    // 跳过空格，找到属性开始
    let mut attrs_start = tag_end;
    while attrs_start < chars.len() && chars[attrs_start] == ' ' {
        attrs_start += 1;
    }

    // 找到标签结束
    let mut tag_content_end = tag_end;
    let mut depth = 0;
    let mut in_string = false;
    let mut string_char = ' ';

    for i in tag_end..chars.len() {
        let c = chars[i];
        if !in_string {
            if c == '"' || c == '\'' {
                in_string = true;
                string_char = c;
            } else if c == '>' {
                tag_content_end = i;
                break;
            } else if c == '/' && i + 1 < chars.len() && chars[i + 1] == '>' {
                tag_content_end = i;
                break;
            }
        } else if c == string_char {
            in_string = false;
        }
    }

    let attrs_str = trimmed[attrs_start..tag_content_end].trim();

    // 找到 children
    let mut children = "";
    if tag_content_end < trimmed.len() && chars[tag_content_end] == '>' {
        let after_open = tag_content_end + 1;
        // 找到闭合标签
        let close_tag = format!("</{}>", tag_name);
        if let Some(close_pos) = trimmed[after_open..].find(&close_tag) {
            children = &trimmed[after_open..after_open + close_pos];
        }
    }

    Some((tag_name.to_string(), attrs_str, children))
}

/// 解析 JSX props 字符串
fn parse_jsx_props(attrs_str: &str) -> Vec<String> {
    let mut props = Vec::new();
    let trimmed = attrs_str.trim();

    if trimmed.is_empty() {
        return props;
    }

    let chars: Vec<char> = trimmed.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        // 跳过空格
        while i < chars.len() && chars[i] == ' ' {
            i += 1;
        }

        if i >= chars.len() {
            break;
        }

        // 读取属性名
        let mut attr_name = String::new();
        while i < chars.len() && chars[i] != ' ' && chars[i] != '=' {
            attr_name.push(chars[i]);
            i += 1;
        }

        // 跳过空格
        while i < chars.len() && chars[i] == ' ' {
            i += 1;
        }

        // 读取值
        if i < chars.len() && chars[i] == '=' {
            i += 1;
            // 跳过空格
            while i < chars.len() && chars[i] == ' ' {
                i += 1;
            }

            if i < chars.len() {
                let (value, new_i) = read_jsx_value(&chars, i);
                props.push(format!("{}: {}", attr_name, value));
                i = new_i;
            }
        }

        // 跳过空格和可能的换行
        while i < chars.len() && (chars[i] == ' ' || chars[i] == '\n' || chars[i] == '\r' || chars[i] == '\t') {
            i += 1;
        }
    }

    props
}

/// 读取 JSX 值
fn read_jsx_value(chars: &[char], start: usize) -> (String, usize) {
    if start >= chars.len() {
        return (String::new(), start);
    }

    let first = chars[start];

    if first == '{' {
        // JSX 表达式：读取花括号内的内容（不包含外层 {}）
        let mut depth = 1;
        let mut i = start + 1;
        let mut value = String::new();

        while i < chars.len() && depth > 0 {
            let c = chars[i];
            if c == '{' {
                depth += 1;
                value.push(c);
            } else if c == '}' {
                depth -= 1;
                if depth > 0 {
                    value.push(c);
                }
            } else {
                value.push(c);
            }
            i += 1;
        }

        (value, i)
    } else if first == '"' || first == '\'' {
        // 字符串字面量
        let mut value = String::new();
        value.push(first);
        let mut i = start + 1;

        while i < chars.len() {
            let c = chars[i];
            value.push(c);
            if c == first {
                i += 1;
                break;
            }
            i += 1;
        }

        (value, i)
    } else {
        // 其他值
        let mut value = String::new();
        let mut i = start;

        while i < chars.len() {
            let c = chars[i];
            if c == ' ' || c == '/' || c == '>' {
                break;
            }
            value.push(c);
            i += 1;
        }

        (value, i)
    }
}

/// 注入 insert 调用到组件函数中
fn inject_insert_calls(templates_code: &str, ast_code: &str, state: &DomCompilerState) -> String {
    // 检查是否有 child_bindings
    let has_child_bindings = state.templates.iter().any(|t| !t.child_bindings.is_empty());

    if !has_child_bindings {
        // 没有动态子节点，直接返回模板代码 + AST 代码
        return format!("{}{}", templates_code, ast_code);
    }

    // 方案：在代码生成阶段通过字符串操作生成 IIFE 结构

    // 生成模板声明和静态数据的代码
    let mut result = templates_code.to_string();

    // 为每个有 child_bindings 的模板生成 IIFE 代码
    for template in &state.templates {
        if template.child_bindings.is_empty() {
            continue;
        }

        // 生成节点缓存和 insert 调用的代码
        let (node_cache, insert_calls, _marker_refs) = generate_node_refs_and_inserts(template);

        // 在 AST 代码中找到 return _tmpl$N(); 模式
        let return_pattern = format!("return {}();", template.name);

        // 生成 IIFE 结构
        let iife_code = format!(
            r#"return (() => {{
  const _el$ = {template_name}();
{node_cache}{insert_calls}
  return _el$;
}})();"#,
            template_name = template.name,
            node_cache = node_cache,
            insert_calls = insert_calls
        );

        // 替换 AST 代码中的 return 语句
        let modified_ast = ast_code.replace(&return_pattern, &iife_code);
        result.push_str(&modified_ast);
        return result;
    }

    // 如果没有找到匹配的模式，返回原始代码
    format!("{}{}", result, ast_code)
}

/// 生成节点缓存变量声明和 insert 调用
///
/// 参考 SolidJS dom-expressions 的实现：
/// - 节点通过 firstElementSibling 遍历定位（跳过空白节点）
/// - insert(parent, content, anchor?) 中 anchor 可选
/// - 没有 marker 时，anchor 设为 null，内容追加到父元素末尾
fn generate_node_refs_and_inserts(template: &TemplateDecl) -> (String, String, Vec<String>) {
    let mut node_cache = String::new();
    let mut insert_calls = String::new();
    let mut marker_refs = Vec::new();

    // current_ref 指向根节点（已在 IIFE 中声明为 _el$）
    let mut current_ref = "_el$".to_string();

    for (i, binding) in template.child_bindings.iter().enumerate() {
        // 生成节点缓存变量（从 _el$1 开始）
        let node_var = format!("_el${}", i + 1);

        // 根据 index 确定遍历方式：
        // - index == 0: firstElementChild（获取第一个元素子节点，跳过空白）
        // - index > 0: nextElementSibling（下一个兄弟元素节点）
        let node_expr = if i == 0 {
            format!("{}.firstElementChild", current_ref)
        } else {
            format!("{}.nextElementSibling", current_ref)
        };

        // 生成缓存变量
        node_cache.push_str(&format!("  const {} = {};\n", node_var, node_expr));

        // 没有 marker 时，anchor 设为 null
        marker_refs.push("null".to_string());

        // 处理表达式
        let expr = &binding.expression;

        // 生成 insert 调用，anchor 设为 null
        insert_calls.push_str(&format!(
            "  insert({}, {}, null);\n",
            node_var, expr
        ));

        current_ref = node_var;
    }

    (node_cache, insert_calls, marker_refs)
}

/// 清理 JSX children 区域，将其转换为函数调用参数格式
/// 例如: `{props.children}` -> `props.children`
/// 例如: `{foo}{bar}` -> `foo, bar`
/// 例如: `  {children}  ` -> `children`
fn clean_jsx_children_for_call(raw: &str) -> String {
    let raw = raw.trim();
    if raw.is_empty() {
        return String::new();
    }

    let mut parts = Vec::new();
    let mut current = String::new();
    let mut brace_depth = 0;
    let mut in_brace = false;

    for ch in raw.chars() {
        match ch {
            '{' if !in_brace => {
                // 开始表达式
                if !current.trim().is_empty() {
                    // 文本节点，需要引号包裹
                    parts.push(format!("\"{}\"", current.trim()));
                }
                current = String::new();
                in_brace = true;
                brace_depth = 1;
            }
            '{' if in_brace => {
                brace_depth += 1;
                current.push(ch);
            }
            '}' if in_brace => {
                brace_depth -= 1;
                if brace_depth == 0 {
                    // 表达式结束
                    let expr = current.trim();
                    if !expr.is_empty() {
                        parts.push(expr.to_string());
                    }
                    current = String::new();
                    in_brace = false;
                } else {
                    current.push(ch);
                }
            }
            '}' if !in_brace => {
                // 不应该发生
            }
            _ => {
                current.push(ch);
            }
        }
    }

    // 处理剩余内容
    if !current.trim().is_empty() {
        if in_brace {
            parts.push(current.trim().to_string());
        } else {
            parts.push(format!("\"{}\"", current.trim()));
        }
    }

    parts.join(", ")
}
