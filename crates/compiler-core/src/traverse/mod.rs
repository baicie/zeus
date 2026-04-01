//! AST 遍历模块
//!
//! 这里提供 **最小可用** 的 `oxc_traverse` 集成：
//! - 使用 `oxc_traverse::traverse_mut` 遍历 AST
//! - 在 `enter_jsx_element` 中收集委托事件、标记使用的 runtime helpers
//!
//! 后续在此基础上逐步补齐：JSX → AST 替换、模板抽取、控制流转换等。

pub mod state;
pub mod whitespace;
pub mod control_flow;
pub mod transform;

pub use state::{
    Target, DomCompilerState, TemplateDecl, AttrBinding, AttrBindingKind,
    ChildBinding, StaticNode, ListRender, PendingTransform,
};
pub use whitespace::{cleanup_template_html, normalize_jsx_whitespace};
pub use transform::JsxTransformer;

use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_semantic::SemanticBuilder;
use oxc_span::GetSpan;
use oxc_traverse::{traverse_mut, Traverse, TraverseCtx};
use zeus_compiler_common::CompilerOptions;

use crate::codegen::CodeGenerator;

use self::control_flow::ControlFlowAnalyzer;

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
            self.state.add_helper("renderList");
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

        let mut transformer = JsxTransformer::new(self.source);

        // 检查是否是列表渲染 (.map() 调用)
        let is_list_rendering = if let Expression::CallExpression(call) = arg {
            let transformer = JsxTransformer::new(self.source);
            let callee_str = transformer.expression_to_source(&call.callee);
            callee_str.contains(".map") || callee_str.contains("map(")
        } else {
            false
        };

        if is_list_rendering {
            self.state.add_helper("template");
            self.state.add_helper("renderList");
            let item_tmpl_name = self.state.generate_template_name();
            self.state.templates.push(TemplateDecl {
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
                let (html, child_bindings, attr_bindings) = transformer.jsx_element_to_template_ir(jsx);

                let tmpl_name = self.state.generate_template_name();
                self.state.add_helper("template");

                if !child_bindings.is_empty() {
                    self.state.add_helper("insert");
                }

                if attr_bindings.iter().any(|b| matches!(b.kind, AttrBindingKind::Event)) {
                    self.state.add_helper("delegateEvents");
                }

                self.state.templates.push(TemplateDecl {
                    name: tmpl_name.clone(),
                    html,
                    child_bindings,
                    attr_bindings,
                    marker_paths: Vec::new(),
                    needs_markers: false,
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
            Expression::CallExpression(call) => {
                for arg_item in &mut call.arguments {
                    if let Some(expr) = arg_item.as_expression_mut() {
                        if let Expression::ArrowFunctionExpression(arrow) = expr {
                            if let Some(stmt) = arrow.body.statements.first() {
                                if let Statement::ReturnStatement(ret_stmt) = stmt {
                                    if let Some(ret_arg) = ret_stmt.argument.as_ref() {
                                        if let Expression::JSXElement(jsx) = ret_arg {
                                            let (html, child_bindings, attr_bindings) = transformer.jsx_element_to_template_ir(jsx);

                                            let tmpl_name = self.state.generate_template_name();
                                            self.state.add_helper("template");

                                            if !child_bindings.is_empty() {
                                                self.state.add_helper("insert");
                                            }

                                            if attr_bindings.iter().any(|b| matches!(b.kind, AttrBindingKind::Event)) {
                                                self.state.add_helper("delegateEvents");
                                            }

                                            self.state.templates.push(TemplateDecl {
                                                name: tmpl_name.clone(),
                                                html,
                                                child_bindings,
                                                attr_bindings,
                                                marker_paths: Vec::new(),
                                                needs_markers: false,
                                            });
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Expression::JSXFragment(frag) => {
                let (html, child_bindings) = transformer.jsx_fragment_to_template_ir(frag);

                let tmpl_name = self.state.generate_template_name();
                self.state.add_helper("template");

                if !child_bindings.is_empty() {
                    self.state.add_helper("insert");
                }

                self.state.templates.push(TemplateDecl {
                    name: tmpl_name.clone(),
                    html,
                    child_bindings,
                    attr_bindings: Vec::new(),
                    marker_paths: Vec::new(),
                    needs_markers: false,
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
        let mut analyzer = ControlFlowAnalyzer::new(self.source);
        if analyzer.should_transform_to_ternary(node) {
            analyzer.transform_to_ternary(node, &mut self.state);
        }
        let _ = ctx;
    }

    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, _ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        self.state.in_jsx = true;
        self.state.depth += 1;

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

    fn exit_jsx_element(&mut self, node: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, DomCompilerState>) {
        self.state.depth -= 1;

        let mut transformer = JsxTransformer::new(self.source);
        let (element_html, child_bindings, attr_bindings) = transformer.jsx_element_to_template_ir(node);

        // 获取嵌套模板
        let nested_templates = transformer.take_nested_templates();
        for nested_tmpl in nested_templates {
            self.state.templates.push(nested_tmpl);
        }

        if child_bindings.is_empty() && attr_bindings.is_empty() {
            return;
        }

        let tmpl_name = self.state.generate_template_name();
        self.state.add_helper("template");

        if !child_bindings.is_empty() {
            self.state.add_helper("insert");
        }

        if attr_bindings.iter().any(|b| matches!(b.kind, AttrBindingKind::Event)) {
            self.state.add_helper("delegateEvents");
        }

        self.state.templates.push(TemplateDecl {
            name: tmpl_name.clone(),
            html: element_html,
            child_bindings,
            attr_bindings,
            marker_paths: Vec::new(),
            needs_markers: false,
        });

        // 将 JSX 元素替换为模板调用
        // 注意：由于 oxc_traverse 的限制，我们无法直接替换当前节点
        // 替代方案：在 return 语句等入口点进行替换
        let _ = (node, ctx, tmpl_name);
    }
}

/// 编译函数
pub fn compile(source: &str, options: CompilerOptions) -> Result<String, String> {
    let allocator = Allocator::default();

    let source_type_str = options.source_type.as_deref().unwrap_or("jsx");

    let mut program = match crate::parser::parse_with_allocator(&allocator, source, source_type_str) {
        Ok(p) => p,
        Err(e) => return Err(e.message),
    };

    let semantic_ret = SemanticBuilder::new()
        .build(&program);

    let _scoping = semantic_ret.semantic.scoping();

    let mut pass = DomCompilerPass::new(source, options);

    let initial_state = DomCompilerState::new();

    let scopes = oxc_semantic::Scoping::default();
    traverse_mut(&mut pass, &allocator, &mut program, scopes, initial_state);

    // 生成代码
    let generated_code = generate_compiled_code(&pass.state, &allocator, &program);

    Ok(generated_code)
}

/// 生成编译后的代码
fn generate_compiled_code(state: &DomCompilerState, _allocator: &Allocator, program: &Program) -> String {
    let mut code = String::new();

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

    // 5. 注入 insert 调用到组件函数中
    let final_code = inject_insert_calls(&code, &ast_code, state);

    final_code
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
    // 这是因为 AST 级别的修改需要更复杂的 API

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
        // 使用 i（循环索引）来判断第一个元素
        let node_expr = if i == 0 {
            // 第一个子节点，使用 firstElementChild
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
